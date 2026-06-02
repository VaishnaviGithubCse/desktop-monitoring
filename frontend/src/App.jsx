import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Monitor, 
  Video, 
  Image as ImageIcon, 
  Users, 
  HardDrive,
  LayoutDashboard,
  MapPin
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [users, setUsers] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [screenshots, setScreenshots] = useState([]);
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [usersRes, recordingsRes, screenshotsRes, systemInfoRes] = await Promise.all([
          axios.get(`${API_BASE}/api/users`).catch(() => ({ data: [] })),
          axios.get(`${API_BASE}/api/recordings`).catch(() => ({ data: [] })),
          axios.get(`${API_BASE}/api/screenshots`).catch(() => ({ data: [] })),
          axios.get(`${API_BASE}/api/system-info`).catch(() => ({ data: null }))
        ]);
        
        setUsers(usersRes.data || []);
        setRecordings(recordingsRes.data || []);
        setScreenshots(screenshotsRes.data || []);
        setSystemInfo(systemInfoRes.data || null);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="loading-container">
          <div className="loader"></div>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <>
            <div className="header">
              <h1>System Overview</h1>
              <p>Monitor your active endpoints and captured data.</p>
            </div>
            
            {systemInfo && (
              <div className="glass-card" style={{ marginBottom: '2rem', padding: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '2rem' }}>
                <div style={{ flex: '1 1 300px' }}>
                  <h3 style={{ color: '#4ade80', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Monitor size={20} /> Host System
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                    <p><strong style={{ color: '#e4e4e7' }}>Hostname:</strong> {systemInfo.system?.hostname}</p>
                    <p><strong style={{ color: '#e4e4e7' }}>OS:</strong> {systemInfo.system?.type} {systemInfo.system?.release} ({systemInfo.system?.arch})</p>
                    <p><strong style={{ color: '#e4e4e7' }}>Platform:</strong> {systemInfo.system?.platform}</p>
                  </div>
                </div>
                {systemInfo.location && systemInfo.location.status === 'success' && (
                  <div style={{ flex: '1 1 300px' }}>
                    <h3 style={{ color: '#3b82f6', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <MapPin size={20} /> Location
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem', color: '#a1a1aa' }}>
                      <p><strong style={{ color: '#e4e4e7' }}>IP Address:</strong> {systemInfo.location.query}</p>
                      <p><strong style={{ color: '#e4e4e7' }}>City:</strong> {systemInfo.location.city}, {systemInfo.location.regionName}</p>
                      <p><strong style={{ color: '#e4e4e7' }}>Country:</strong> {systemInfo.location.country}</p>
                      <p><strong style={{ color: '#e4e4e7' }}>ISP:</strong> {systemInfo.location.isp}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="stats-grid">
              <div className="glass-card stat-card">
                <div className="stat-icon"><Users size={24} /></div>
                <div className="stat-details">
                  <h3>Registered Users</h3>
                  <p>{users.length}</p>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon"><Video size={24} /></div>
                <div className="stat-details">
                  <h3>Total Recordings</h3>
                  <p>{recordings.length}</p>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon"><ImageIcon size={24} /></div>
                <div className="stat-details">
                  <h3>Total Screenshots</h3>
                  <p>{screenshots.length}</p>
                </div>
              </div>
              <div className="glass-card stat-card">
                <div className="stat-icon"><HardDrive size={24} /></div>
                <div className="stat-details">
                  <h3>Storage Used</h3>
                  <p>
                    {formatBytes(
                      recordings.reduce((acc, curr) => acc + curr.size, 0) + 
                      screenshots.reduce((acc, curr) => acc + curr.size, 0)
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="header" style={{ marginTop: '2rem' }}>
              <h1>Recent Activity</h1>
            </div>
            
            <div className="media-grid">
              {recordings.slice(0, 2).map((rec, i) => (
                <div key={i} className="glass-card media-item">
                  <video 
                    className="video-player" 
                    controls 
                    src={`${API_BASE}/api/stream/${rec.filename}`} 
                  />
                  <div className="media-info">
                    <div className="media-title">{rec.filename}</div>
                    <div className="media-meta">
                      <span>{formatDate(rec.createdAt)}</span>
                      <span>{formatBytes(rec.size)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {screenshots.slice(0, 2).map((img, i) => (
                <div key={i} className="glass-card media-item">
                  <img 
                    className="media-thumbnail" 
                    src={`${API_BASE}${img.url}`} 
                    alt={img.filename} 
                  />
                  <div className="media-info">
                    <div className="media-title">{img.filename}</div>
                    <div className="media-meta">
                      <span>{formatDate(img.createdAt)}</span>
                      <span>{formatBytes(img.size)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        );

      case 'recordings':
        return (
          <>
            <div className="header">
              <h1>Screen Recordings</h1>
              <p>Browse and playback recorded sessions.</p>
            </div>
            <div className="media-grid">
              {recordings.map((rec, i) => (
                <div key={i} className="glass-card media-item">
                  <video 
                    className="video-player" 
                    controls 
                    src={`${API_BASE}/api/stream/${rec.filename}`} 
                  />
                  <div className="media-info">
                    <div className="media-title">{rec.filename}</div>
                    <div className="media-meta">
                      <span>{formatDate(rec.createdAt)}</span>
                      <span>{formatBytes(rec.size)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {recordings.length === 0 && <p>No recordings found.</p>}
            </div>
          </>
        );

      case 'screenshots':
        return (
          <>
            <div className="header">
              <h1>Screenshots</h1>
              <p>View captured screen images.</p>
            </div>
            <div className="media-grid">
              {screenshots.map((img, i) => (
                <div key={i} className="glass-card media-item">
                  <a href={`${API_BASE}${img.url}`} target="_blank" rel="noreferrer">
                    <img 
                      className="media-thumbnail" 
                      src={`${API_BASE}${img.url}`} 
                      alt={img.filename} 
                    />
                  </a>
                  <div className="media-info">
                    <div className="media-title">{img.filename}</div>
                    <div className="media-meta">
                      <span>{formatDate(img.createdAt)}</span>
                      <span>{formatBytes(img.size)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {screenshots.length === 0 && <p>No screenshots found.</p>}
            </div>
          </>
        );

      case 'users':
        return (
          <>
            <div className="header">
              <h1>Monitored Users</h1>
              <p>Endpoints currently tracked by the system.</p>
            </div>
            <div className="table-container glass-card" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Machine Name</th>
                    <th>OS</th>
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length > 0 ? users.map((user, i) => (
                    <tr key={i}>
                      <td>{user.id || i + 1}</td>
                      <td>{user.username || 'N/A'}</td>
                      <td>{user.machine_name || 'N/A'}</td>
                      <td>{user.os_name || 'N/A'}</td>
                      <td>{user.location || 'N/A'}</td>
                      <td>
                        <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#4ade80', display: 'inline-block' }}></span>
                          Active
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
                        No user data available or database disconnected.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="brand">
          <Monitor className="brand-icon" size={28} />
          Smart Monitor
        </div>
        
        <nav>
          <div 
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={20} />
            Dashboard
          </div>
          <div 
            className={`nav-item ${activeTab === 'recordings' ? 'active' : ''}`}
            onClick={() => setActiveTab('recordings')}
          >
            <Video size={20} />
            Recordings
          </div>
          <div 
            className={`nav-item ${activeTab === 'screenshots' ? 'active' : ''}`}
            onClick={() => setActiveTab('screenshots')}
          >
            <ImageIcon size={20} />
            Screenshots
          </div>
          <div 
            className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={20} />
            Users
          </div>
        </nav>
      </aside>

      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
