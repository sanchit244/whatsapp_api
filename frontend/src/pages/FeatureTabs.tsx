import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const API = 'http://localhost:3000';

// ─── Colour tokens ────────────────────────────────────────────────────────────
const COLORS = {
  sent: '#25d366',
  delivered: '#128C7E',
  read: '#34B7F1',
  failed: '#ff4d4f',
  pending: '#faad14',
};
const PIE_COLORS = ['#25d366', '#128C7E', '#34B7F1', '#ff4d4f', '#faad14'];

// ─── ANALYTICS TAB ────────────────────────────────────────────────────────────
export const AnalyticsTab: React.FC<{ token: string }> = ({ token }) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, tRes] = await Promise.all([
        fetch(`${API}/api/v1/analytics/dashboard`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/v1/analytics/timeline?days=${days}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const mData = await mRes.json();
      const tData = await tRes.json();
      if (mData.success) setMetrics(mData.metrics);
      if (tData.success) setTimeline(tData.timeline.map((r: any) => ({
        date: r.date?.substring(5), // MM-DD
        Sent: parseInt(r.sent || 0),
        Delivered: parseInt(r.delivered || 0),
        Read: parseInt(r.read || 0),
        Failed: parseInt(r.failed || 0),
      })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token, days]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const pieData = metrics ? [
    { name: 'Sent', value: metrics.sent_messages },
    { name: 'Delivered', value: metrics.delivered_messages },
    { name: 'Read', value: metrics.read_messages },
    { name: 'Failed', value: metrics.failed_messages },
    { name: 'Pending', value: metrics.pending_messages },
  ].filter(d => d.value > 0) : [];

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* ── Stat Cards ── */}
      <div style={styles.statGrid}>
        {metrics && [
          { label: 'Total Messages', value: metrics.total_messages, color: '#25d366' },
          { label: 'Delivered', value: metrics.delivered_messages, color: '#128C7E' },
          { label: 'Read', value: metrics.read_messages, color: '#34B7F1' },
          { label: 'Failed', value: metrics.failed_messages, color: '#ff4d4f' },
          { label: 'Delivery Rate', value: metrics.delivery_rate, color: '#25d366' },
          { label: 'Read Rate', value: metrics.read_rate, color: '#34B7F1' },
          { label: 'Total Campaigns', value: metrics.total_campaigns, color: '#a855f7' },
          { label: 'Total Contacts', value: metrics.total_contacts, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ ...styles.statCard, borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value ?? '—'}</div>
            <div style={{ fontSize: 12, color: '#8899a6', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
        {loading && !metrics && <div style={{ color: '#8899a6', padding: 20 }}>Loading metrics…</div>}
      </div>

      {/* ── Timeline Chart ── */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <span style={styles.chartTitle}>📈 Message Timeline</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{ ...styles.dayBtn, background: days === d ? '#25d366' : '#1a2733', color: days === d ? '#000' : '#ccc' }}>
                {d}d
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={timeline}>
            <defs>
              {Object.entries(COLORS).map(([k, c]) => (
                <linearGradient key={k} id={`grad_${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={c} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={c} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3040" />
            <XAxis dataKey="date" tick={{ fill: '#8899a6', fontSize: 11 }} />
            <YAxis tick={{ fill: '#8899a6', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1f2d', border: '1px solid #1e3040', borderRadius: 8 }} />
            <Legend />
            <Area type="monotone" dataKey="Sent" stroke={COLORS.sent} fill={`url(#grad_sent)`} strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="Delivered" stroke={COLORS.delivered} fill={`url(#grad_delivered)`} strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="Read" stroke={COLORS.read} fill={`url(#grad_read)`} strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="Failed" stroke={COLORS.failed} fill={`url(#grad_failed)`} strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Bottom row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Pie */}
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>🍩 Status Breakdown</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                {pieData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0d1f2d', border: '1px solid #1e3040', borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar */}
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>📊 Daily Volume (last {days} days)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={timeline.slice(-10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3040" />
              <XAxis dataKey="date" tick={{ fill: '#8899a6', fontSize: 11 }} />
              <YAxis tick={{ fill: '#8899a6', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0d1f2d', border: '1px solid #1e3040', borderRadius: 8 }} />
              <Bar dataKey="Sent" fill="#25d366" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Failed" fill="#ff4d4f" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CSV Export */}
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <a href={`${API}/api/v1/analytics/export`} style={styles.exportBtn}>
          ⬇ Export CSV
        </a>
      </div>
    </div>
  );
};

// ─── CONTACT GROUPS TAB ───────────────────────────────────────────────────────
export const ContactGroupsTab: React.FC<{ token: string }> = ({ token }) => {
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [groupContacts, setGroupContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // CSV Import
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importGroupId, setImportGroupId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/contacts/groups`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setGroups(data.groups);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const fetchGroupContacts = async (groupId: string) => {
    const res = await fetch(`${API}/api/v1/contacts/groups/${groupId}/members`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.success) setGroupContacts(data.contacts);
  };

  const selectGroup = (g: any) => {
    setSelectedGroup(g);
    fetchGroupContacts(g.id);
  };

  const createGroup = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch(`${API}/api/v1/contacts/groups`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, description: newDesc }),
    });
    if (res.ok) { setNewName(''); setNewDesc(''); setShowCreate(false); fetchGroups(); }
    setCreating(false);
  };

  const deleteGroup = async (groupId: string) => {
    if (!window.confirm('Delete this group?')) return;
    await fetch(`${API}/api/v1/contacts/groups/${groupId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setSelectedGroup(null);
    setGroupContacts([]);
    fetchGroups();
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string || '');
    reader.readAsText(file);
  };

  const doImport = async () => {
    if (!csvText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`${API}/api/v1/contacts/import/csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_text: csvText, group_id: importGroupId || undefined }),
      });
      const data = await res.json();
      setImportResult(data);
      if (data.success) { fetchGroups(); if (selectedGroup) fetchGroupContacts(selectedGroup.id); }
    } catch (e: any) { setImportResult({ success: false, message: e.message }); }
    setImporting(false);
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* Groups sidebar */}
      <div style={{ width: 260, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>Groups</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowImport(!showImport)} style={styles.btnSecondary}>📥 CSV</button>
            <button onClick={() => setShowCreate(!showCreate)} style={styles.btnGreen}>+ New</button>
          </div>
        </div>

        {showCreate && (
          <div style={styles.createBox}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Group name *" style={styles.input} />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" style={{ ...styles.input, marginTop: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={createGroup} disabled={creating} style={styles.btnGreen}>{creating ? 'Creating…' : 'Create'}</button>
              <button onClick={() => setShowCreate(false)} style={styles.btnSecondary}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? <div style={{ color: '#8899a6', padding: 16 }}>Loading…</div> : groups.length === 0 ? (
          <div style={{ color: '#8899a6', padding: 16, fontSize: 13 }}>No groups yet. Create one or import contacts.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.map(g => (
              <div key={g.id} onClick={() => selectGroup(g)}
                style={{ ...styles.groupItem, background: selectedGroup?.id === g.id ? '#1a3a4a' : '#0d1f2d', borderColor: selectedGroup?.id === g.id ? '#25d366' : '#1e3040' }}>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{g.name}</div>
                <div style={{ fontSize: 12, color: '#8899a6' }}>{g.member_count} contacts</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* CSV Import panel */}
        {showImport && (
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ color: '#fff', fontWeight: 600, marginBottom: 12 }}>📥 Import Contacts from CSV</div>
            <div style={{ color: '#8899a6', fontSize: 12, marginBottom: 12 }}>
              CSV must have a <code style={{ color: '#25d366' }}>phone</code> column. Optional: <code style={{ color: '#25d366' }}>first_name, last_name, email</code>
            </div>
            <input ref={csvFileRef} type="file" accept=".csv,.txt" onChange={handleCsvFile} style={{ display: 'none' }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => csvFileRef.current?.click()} style={styles.btnSecondary}>📁 Choose CSV File</button>
              {csvText && <span style={{ color: '#25d366', fontSize: 12, alignSelf: 'center' }}>✓ File loaded ({csvText.split('\n').length - 1} rows)</span>}
            </div>
            <select value={importGroupId} onChange={e => setImportGroupId(e.target.value)} style={{ ...styles.input, marginBottom: 12 }}>
              <option value="">No group (import contacts only)</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <textarea value={csvText} onChange={e => setCsvText(e.target.value)}
              placeholder="Or paste CSV content here…&#10;phone,first_name,last_name,email&#10;919876543210,John,Doe,john@example.com"
              style={{ ...styles.textarea, minHeight: 100, marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={doImport} disabled={importing || !csvText.trim()} style={styles.btnGreen}>
                {importing ? '⏳ Importing…' : '⬆ Import'}
              </button>
              <button onClick={() => { setShowImport(false); setImportResult(null); setCsvText(''); }} style={styles.btnSecondary}>Close</button>
            </div>
            {importResult && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: importResult.success ? '#0a2a1a' : '#2a0a0a', border: `1px solid ${importResult.success ? '#25d366' : '#ff4d4f'}` }}>
                {importResult.success
                  ? <span style={{ color: '#25d366' }}>✓ Imported {importResult.imported} contacts, skipped {importResult.skipped}</span>
                  : <span style={{ color: '#ff4d4f' }}>✗ {importResult.message || 'Import failed'}</span>}
              </div>
            )}
          </div>
        )}

        {/* Group contacts */}
        {selectedGroup ? (
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{selectedGroup.name}</div>
                {selectedGroup.description && <div style={{ color: '#8899a6', fontSize: 13 }}>{selectedGroup.description}</div>}
              </div>
              <button onClick={() => deleteGroup(selectedGroup.id)} style={styles.btnDanger}>🗑 Delete Group</button>
            </div>
            <div style={{ color: '#8899a6', fontSize: 13, marginBottom: 12 }}>{groupContacts.length} contacts in this group</div>
            {groupContacts.length === 0 ? (
              <div style={{ color: '#4a6278', padding: '40px 0', textAlign: 'center', fontSize: 14 }}>
                No contacts yet. Import via CSV and assign to this group.
              </div>
            ) : (
              <div style={{ overflow: 'auto', maxHeight: 420 }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {['Phone', 'Name', 'Email', 'Opted In'].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupContacts.map(c => (
                      <tr key={c.id} style={styles.tr}>
                        <td style={styles.td}>{c.phone_number}</td>
                        <td style={styles.td}>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                        <td style={styles.td}>{c.email || '—'}</td>
                        <td style={styles.td}>
                          <span style={{ color: c.opted_in ? '#25d366' : '#ff4d4f', fontSize: 12 }}>{c.opted_in ? '✓ Yes' : '✗ No'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div style={{ ...styles.card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: '#4a6278' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>👥</div>
            <div>Select a group to view its contacts, or create a new one.</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── INBOX TAB ────────────────────────────────────────────────────────────────
interface InboxMessage {
  id: string;
  from_number: string;
  display_name: string;
  message_type: string;
  body: string;
  media_url?: string;
  is_read: boolean;
  received_at: string;
}

export const InboxTab: React.FC<{ token: string; tenantId?: string }> = ({ token, tenantId }) => {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selected, setSelected] = useState<InboxMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef<any>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === 'unread'
        ? `${API}/api/v1/inbox?unread=true`
        : `${API}/api/v1/inbox`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages);
        setUnreadCount(data.unread_count);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token, filter]);

  // Socket.IO connection for real-time inbox
  useEffect(() => {
    if (!tenantId) return;
    let io: any;
    import('socket.io-client').then(({ io: ioFn }) => {
      io = ioFn('http://localhost:3000', { transports: ['websocket', 'polling'] });
      socketRef.current = io;
      io.on('connect', () => {
        setSocketConnected(true);
        io.emit('join_tenant', tenantId);
      });
      io.on('disconnect', () => setSocketConnected(false));
      io.on('inbox_message', (msg: InboxMessage) => {
        setMessages(prev => [msg, ...prev]);
        setUnreadCount(prev => prev + 1);
      });
    });
    return () => { if (io) io.disconnect(); };
  }, [tenantId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const markRead = async (id: string) => {
    await fetch(`${API}/api/v1/inbox/${id}/read`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
    });
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await fetch(`${API}/api/v1/inbox/mark-all-read`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
    setUnreadCount(0);
  };

  const handleSelect = (m: InboxMessage) => {
    setSelected(m);
    if (!m.is_read) markRead(m.id);
  };

  const fmtTime = (dt: string) => {
    const d = new Date(dt);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 3600000;
    if (diffH < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString();
  };

  const visibleMsgs = filter === 'unread' ? messages.filter(m => !m.is_read) : messages;

  return (
    <div style={{ display: 'flex', gap: 0, height: 520, borderRadius: 12, overflow: 'hidden', border: '1px solid #1e3040' }}>
      {/* Left: message list */}
      <div style={{ width: 300, flexShrink: 0, background: '#071520', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e3040', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#fff', fontWeight: 600 }}>Inbox</span>
            {unreadCount > 0 && <span style={styles.badge}>{unreadCount}</span>}
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: socketConnected ? '#25d366' : '#ff4d4f', display: 'inline-block' }} title={socketConnected ? 'Live' : 'Connecting…'} />
          </div>
          <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#8899a6', cursor: 'pointer', fontSize: 12 }}>Mark all read</button>
        </div>

        {/* Filter */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e3040', display: 'flex', gap: 6 }}>
          {(['all', 'unread'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ ...styles.filterBtn, background: filter === f ? '#25d366' : 'transparent', color: filter === f ? '#000' : '#8899a6' }}>
              {f === 'all' ? 'All' : `Unread (${unreadCount})`}
            </button>
          ))}
        </div>

        {/* Message list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? <div style={{ color: '#8899a6', padding: 20, fontSize: 13 }}>Loading…</div>
            : visibleMsgs.length === 0 ? (
              <div style={{ color: '#4a6278', padding: 24, textAlign: 'center', fontSize: 13 }}>
                {filter === 'unread' ? 'No unread messages 🎉' : 'No messages yet. Incoming WhatsApp replies will appear here in real-time.'}
              </div>
            ) : visibleMsgs.map(m => (
              <div key={m.id} onClick={() => handleSelect(m)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #0d1f2d',
                  cursor: 'pointer',
                  background: selected?.id === m.id ? '#1a3a4a' : m.is_read ? 'transparent' : '#0a2a1a',
                  transition: 'background 0.15s',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontWeight: m.is_read ? 400 : 700, color: '#fff', fontSize: 14 }}>{m.display_name || m.from_number}</span>
                  <span style={{ fontSize: 11, color: '#8899a6' }}>{fmtTime(m.received_at)}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8899a6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.message_type !== 'text' ? `📎 ${m.message_type}` : m.body || '(empty)'}
                </div>
                {!m.is_read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#25d366', float: 'right', marginTop: -16 }} />}
              </div>
            ))}
        </div>
      </div>

      {/* Right: message detail */}
      <div style={{ flex: 1, background: '#0d1f2d', display: 'flex', flexDirection: 'column' }}>
        {selected ? (
          <>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e3040', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={styles.avatar}>{(selected.display_name || selected.from_number)[0]?.toUpperCase()}</div>
              <div>
                <div style={{ color: '#fff', fontWeight: 600 }}>{selected.display_name || selected.from_number}</div>
                <div style={{ color: '#8899a6', fontSize: 12 }}>{selected.from_number}</div>
              </div>
            </div>

            {/* Message bubble area */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ color: '#8899a6', fontSize: 11, textAlign: 'center', marginBottom: 8 }}>{new Date(selected.received_at).toLocaleString()}</div>
              <div style={{ maxWidth: '75%', alignSelf: 'flex-start' }}>
                <div style={styles.messageBubble}>
                  {selected.message_type !== 'text' && (
                    <div style={{ marginBottom: 6, color: '#25d366', fontSize: 12 }}>📎 {selected.message_type}</div>
                  )}
                  {selected.media_url && (
                    <a href={selected.media_url} target="_blank" rel="noreferrer" style={{ display: 'block', marginBottom: 8, color: '#34B7F1' }}>View media</a>
                  )}
                  <div style={{ color: '#e8f5e8', lineHeight: 1.5, wordBreak: 'break-word' }}>{selected.body || '(no text)'}</div>
                </div>
                <div style={{ fontSize: 11, color: '#8899a6', marginTop: 4 }}>Received • {fmtTime(selected.received_at)}</div>
              </div>
            </div>

            {/* Reply hint */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #1e3040', background: '#071520' }}>
              <div style={{ color: '#4a6278', fontSize: 12, textAlign: 'center' }}>
                💡 Replying via the WhatsApp Cloud API — use your Meta dashboard or integrate reply sending.
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#4a6278' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: 15 }}>Select a message to read</div>
            <div style={{ fontSize: 12, marginTop: 8 }}>New messages arrive in real-time via WhatsApp webhook</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Shared styles ─────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    background: '#0d1f2d',
    borderRadius: 10,
    padding: '14px 16px',
    border: '1px solid #1e3040',
  },
  chartCard: {
    background: '#0d1f2d',
    borderRadius: 10,
    padding: '16px 20px',
    border: '1px solid #1e3040',
    marginBottom: 16,
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  chartTitle: {
    color: '#fff',
    fontWeight: 600,
    fontSize: 15,
    display: 'block',
    marginBottom: 12,
  },
  dayBtn: {
    border: 'none',
    borderRadius: 6,
    padding: '3px 10px',
    cursor: 'pointer',
    fontSize: 12,
    transition: 'all 0.2s',
  },
  exportBtn: {
    background: '#1a3a4a',
    color: '#25d366',
    padding: '8px 18px',
    borderRadius: 8,
    textDecoration: 'none',
    fontSize: 13,
    border: '1px solid #25d366',
    display: 'inline-block',
  },
  card: {
    background: '#0d1f2d',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #1e3040',
  },
  createBox: {
    background: '#071520',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    border: '1px solid #1e3040',
  },
  input: {
    background: '#071520',
    border: '1px solid #1e3040',
    borderRadius: 8,
    color: '#fff',
    padding: '8px 12px',
    width: '100%',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  },
  textarea: {
    background: '#071520',
    border: '1px solid #1e3040',
    borderRadius: 8,
    color: '#fff',
    padding: '8px 12px',
    width: '100%',
    fontSize: 12,
    outline: 'none',
    resize: 'vertical' as const,
    boxSizing: 'border-box',
    fontFamily: 'monospace',
  },
  groupItem: {
    borderRadius: 8,
    padding: '10px 14px',
    cursor: 'pointer',
    border: '1px solid #1e3040',
    transition: 'all 0.15s',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  },
  th: {
    color: '#8899a6',
    fontWeight: 600,
    padding: '8px 12px',
    textAlign: 'left' as const,
    borderBottom: '1px solid #1e3040',
    background: '#071520',
  },
  td: {
    color: '#c8d8e0',
    padding: '8px 12px',
    borderBottom: '1px solid #0d1f2d',
  },
  tr: {
    transition: 'background 0.15s',
  },
  btnGreen: {
    background: '#25d366',
    color: '#000',
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 12,
    whiteSpace: 'nowrap' as const,
  },
  btnSecondary: {
    background: '#1a2733',
    color: '#ccc',
    border: '1px solid #1e3040',
    borderRadius: 8,
    padding: '7px 14px',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap' as const,
  },
  btnDanger: {
    background: 'transparent',
    color: '#ff4d4f',
    border: '1px solid #ff4d4f',
    borderRadius: 8,
    padding: '7px 14px',
    cursor: 'pointer',
    fontSize: 12,
  },
  badge: {
    background: '#ff4d4f',
    color: '#fff',
    borderRadius: 999,
    padding: '1px 6px',
    fontSize: 11,
    fontWeight: 700,
    minWidth: 18,
    textAlign: 'center' as const,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#25d366',
    color: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 18,
    flexShrink: 0,
  },
  messageBubble: {
    background: '#1a3a2a',
    border: '1px solid #25d36633',
    borderRadius: '0 12px 12px 12px',
    padding: '12px 16px',
    maxWidth: '100%',
  },
  filterBtn: {
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    transition: 'all 0.15s',
  },
};
