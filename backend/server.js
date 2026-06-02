const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Root path handler to confirm API status
app.get('/', (req, res) => {
    res.json({
        status: "online",
        message: "Smart Desktop Monitoring Backend API is running."
    });
});

// Local JSON database fallback configuration
const USERS_FILE = path.join(__dirname, 'users.json');
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

function getLocalUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) return [];
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function saveLocalUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (e) {
        console.error('Error saving local users:', e);
    }
}

const localDb = {
    query: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        
        const cleanSql = sql.trim().replace(/\s+/g, ' ');
        
        if (cleanSql.startsWith('CREATE TABLE') || cleanSql.startsWith('ALTER TABLE')) {
            if (callback) callback(null);
            return;
        }
        
        if (cleanSql.startsWith('SELECT * FROM users ORDER BY last_active DESC')) {
            const users = getLocalUsers();
            users.sort((a, b) => new Date(b.last_active || 0) - new Date(a.last_active || 0));
            if (callback) callback(null, users);
            return;
        }
        
        if (cleanSql.startsWith('SELECT * FROM users WHERE username = ? AND machine_name = ?')) {
            const users = getLocalUsers();
            const [username, machineName] = params;
            const filtered = users.filter(u => u.username === username && u.machine_name === machineName);
            if (callback) callback(null, filtered);
            return;
        }
        
        if (cleanSql.includes('UPDATE users SET')) {
            const users = getLocalUsers();
            let updated = false;
            if (params.length === 4) {
                const [osName, locationString, username, machineName] = params;
                for (let u of users) {
                    if (u.username === username && u.machine_name === machineName) {
                        u.status = 'Active';
                        u.os_name = osName;
                        u.location = locationString;
                        u.last_active = new Date().toISOString();
                        updated = true;
                    }
                }
            } else if (params.length === 2) {
                const [username, machineName] = params;
                for (let u of users) {
                    if (u.username === username && u.machine_name === machineName) {
                        u.status = 'Active';
                        u.last_active = new Date().toISOString();
                        updated = true;
                    }
                }
            }
            if (updated) {
                saveLocalUsers(users);
            }
            if (callback) callback(null);
            return;
        }
        
        if (cleanSql.startsWith('INSERT INTO users')) {
            const [username, machineName, osName, locationString] = params;
            const users = getLocalUsers();
            const newUser = {
                id: users.length + 1,
                username,
                machine_name: machineName,
                status: 'Active',
                os_name: osName,
                location: locationString,
                last_active: new Date().toISOString()
            };
            users.push(newUser);
            saveLocalUsers(users);
            if (callback) callback(null);
            return;
        }
        
        if (callback) callback(new Error('Unsupported query in fallback database'));
    }
};

// MySQL connection (uses env URL for cloud, fallback to local credentials)
const connectionConfig = process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root123',
    database: process.env.DB_NAME || 'desktop_monitor'
};

const mysqlConnection = mysql.createConnection(connectionConfig);
let useLocalFallback = false;

const db = {
    query: (...args) => {
        if (useLocalFallback) {
            localDb.query(...args);
        } else {
            mysqlConnection.query(...args);
        }
    }
};

mysqlConnection.connect((err) => {
    if (err) {
        console.error('MySQL connection failed. Falling back to local JSON database (users.json). Error:', err.message);
        useLocalFallback = true;
    } else {
        console.log('Connected to MySQL database');
        const createTable = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255),
                machine_name VARCHAR(255),
                status VARCHAR(50)
            )
        `;
        mysqlConnection.query(createTable, (err) => {
            if (err) console.error('Error creating users table:', err);
            mysqlConnection.query("ALTER TABLE users ADD COLUMN os_name VARCHAR(255)", () => {});
            mysqlConnection.query("ALTER TABLE users ADD COLUMN location VARCHAR(255)", () => {});
            mysqlConnection.query("ALTER TABLE users ADD COLUMN last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", () => {});
        });
    }
});

// Paths to media folders (relative to project for easy cloud deployment)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const RECORDINGS_DIR = path.join(UPLOADS_DIR, 'recordings');
const SCREENSHOTS_DIR = path.join(UPLOADS_DIR, 'screenshots');

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR);
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR);

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, RECORDINGS_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

// Serve static media files
app.use('/media/recordings', express.static(RECORDINGS_DIR));
app.use('/media/screenshots', express.static(SCREENSHOTS_DIR));

// API endpoint to fetch users
app.get('/api/users', (req, res) => {
    const query = 'SELECT * FROM users ORDER BY last_active DESC';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// API endpoint to register or update user machine details
app.post('/api/register', async (req, res) => {
    const { username, machineName, osName, location } = req.body;
    
    // Resolve location automatically using the client's public IP if not provided
    let locationString = location || 'Unknown';
    if (!location) {
        try {
            const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            // Clean IP of IPv6 formatting for localhost or local network
            const cleanIp = clientIp.replace(/^.*:/, '');
            const ipToQuery = (cleanIp === '127.0.0.1' || cleanIp === '1' || cleanIp === '') ? '' : cleanIp;
            
            const response = await fetch(`http://ip-api.com/json/${ipToQuery}`);
            const geoData = await response.json();
            if (geoData.status === 'success') {
                locationString = `${geoData.city}, ${geoData.country}`;
            }
        } catch (fetchErr) {
            console.error('Geo-lookup failed during registration:', fetchErr);
        }
    }
    
    // Check if user already exists
    const checkQuery = 'SELECT * FROM users WHERE username = ? AND machine_name = ?';
    db.query(checkQuery, [username, machineName], (err, results) => {
        if (err) {
            console.error('Error checking user:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length > 0) {
            // Update existing user
            const updateQuery = 'UPDATE users SET status = "Active", os_name = ?, location = ?, last_active = NOW() WHERE username = ? AND machine_name = ?';
            db.query(updateQuery, [osName, locationString, username, machineName], (err) => {
                if (err) {
                    console.error('Error updating user:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ message: 'User updated successfully' });
            });
        } else {
            // Insert new user
            const insertQuery = 'INSERT INTO users (username, machine_name, status, os_name, location) VALUES (?, ?, "Active", ?, ?)';
            db.query(insertQuery, [username, machineName, osName, locationString], (err) => {
                if (err) {
                    console.error('Error inserting user:', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                res.json({ message: 'User registered successfully' });
            });
        }
    });
});

// API endpoint to upload screen recordings
app.post('/api/upload/recording', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
    }

    const { username, machineName } = req.body;
    console.log(`Received file: ${req.file.filename} from ${username}@${machineName}`);

    // Optionally mark the user as Active since they just uploaded a video
    if (username && machineName) {
        const updateStatus = 'UPDATE users SET status = "Active", last_active = NOW() WHERE username = ? AND machine_name = ?';
        db.query(updateStatus, [username, machineName], () => {});
    }

    res.json({
        message: 'File uploaded successfully',
        filename: req.file.filename
    });
});

// Helper function to read directory safely
const getMediaFiles = (dir) => {
    try {
        if (!fs.existsSync(dir)) return [];
        const files = fs.readdirSync(dir);
        return files.map(file => {
            const stats = fs.statSync(path.join(dir, file));
            return {
                filename: file,
                size: stats.size,
                createdAt: stats.birthtime,
                url: `/media/${path.basename(dir)}/${file}`
            };
        }).sort((a, b) => b.createdAt - a.createdAt); // Sort by newest first
    } catch (err) {
        console.error(`Error reading directory ${dir}:`, err);
        return [];
    }
};

// API endpoint to fetch recordings
app.get('/api/recordings', (req, res) => {
    const files = getMediaFiles(RECORDINGS_DIR);
    res.json(files);
});

// API endpoint to fetch screenshots
app.get('/api/screenshots', (req, res) => {
    const files = getMediaFiles(SCREENSHOTS_DIR);
    res.json(files);
});

// API endpoint to stream video (transcodes AVI to MP4 on the fly)
app.get('/api/stream/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(RECORDINGS_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }

    res.contentType('video/mp4');
    
    ffmpeg(filePath)
        .format('mp4')
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions('-movflags frag_keyframe+empty_moov')
        .on('error', (err) => {
            console.error('An error occurred during transcoding: ' + err.message);
        })
        .pipe(res, { end: true });
});

// API endpoint to fetch system and location info
app.get('/api/system-info', async (req, res) => {
    try {
        const systemInfo = {
            hostname: os.hostname(),
            type: os.type(),
            release: os.release(),
            platform: os.platform(),
            arch: os.arch()
        };

        let locationInfo = null;
        try {
            const response = await fetch('http://ip-api.com/json/');
            locationInfo = await response.json();
        } catch (fetchErr) {
            console.error('Error fetching location:', fetchErr);
        }

        res.json({ system: systemInfo, location: locationInfo });
    } catch (err) {
        console.error('Error in /api/system-info:', err);
        res.status(500).json({ error: 'Failed to fetch system info' });
    }
});

app.listen(port, () => {
    console.log(`Backend server running at http://localhost:${port}`);
});
