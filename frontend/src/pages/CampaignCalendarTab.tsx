import React, { useState, useEffect, useCallback } from 'react';
import { extractErrorMessage } from '../utils/errorHelper';

const API = 'http://localhost:3000';

interface CalendarEvent {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled' | 'failed';
  scheduled_at?: string;
  started_at?: string;
  created_at: string;
  completed_at?: string;
  total_messages: number;
  messages_sent: number;
  messages_delivered: number;
  messages_failed: number;
  message_body?: string;
}

interface CampaignCalendarTabProps {
  token: string;
  onOpenCreateModal: () => void;
}

export const CampaignCalendarTab: React.FC<CampaignCalendarTabProps> = ({ token, onOpenCreateModal }) => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<{ date: Date; events: CalendarEvent[] } | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/v1/campaigns/calendar`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.events) {
        setEvents(data.events);
      }
    } catch (err: any) {
      console.error('Failed to fetch calendar events', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Handle Month Navigation
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Grid cells
  const calendarCells: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = [];

  // Trailing days from previous month
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrevMonth - i);
    calendarCells.push({ date: d, isCurrentMonth: false, isToday: false });
  }

  const today = new Date();
  // Days of current month
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    calendarCells.push({ date: d, isCurrentMonth: true, isToday });
  }

  // Next month leading days to complete full 35 or 42 grid
  const remaining = (7 - (calendarCells.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    calendarCells.push({ date: d, isCurrentMonth: false, isToday: false });
  }

  // Match events to dates
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    return events.filter((ev) => {
      const targetStr = ev.scheduled_at || ev.started_at || ev.created_at;
      if (!targetStr) return false;
      const evDate = new Date(targetStr);
      return (
        evDate.getDate() === date.getDate() &&
        evDate.getMonth() === date.getMonth() &&
        evDate.getFullYear() === date.getFullYear()
      );
    });
  };

  // Status colors & labels
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return { bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40', dot: 'bg-blue-400', label: 'Scheduled ⏰' };
      case 'active':
        return { bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-400', label: 'Running 🚀' };
      case 'completed':
        return { bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40', dot: 'bg-purple-400', label: 'Completed' };
      case 'failed':
      case 'cancelled':
        return { bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40', dot: 'bg-rose-400', label: status };
      default:
        return { bg: 'bg-slate-500/20 text-slate-300 border-slate-500/40', dot: 'bg-slate-400', label: status };
    }
  };

  // Actions
  const handleReschedule = async (campaignId: string) => {
    if (!rescheduleTime) {
      alert('Please select a new date and time');
      return;
    }

    try {
      setRescheduling(true);
      const res = await fetch(`${API}/api/v1/campaigns/${campaignId}/reschedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scheduled_at: rescheduleTime }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg({ text: `Rescheduled successfully for ${new Date(rescheduleTime).toLocaleString()}`, type: 'success' });
        setSelectedEvent(null);
        fetchEvents();
      } else {
        setActionMsg({ text: extractErrorMessage(data, 'Failed to reschedule'), type: 'error' });
      }
    } catch {
      setActionMsg({ text: 'Network error rescheduling campaign', type: 'error' });
    } finally {
      setRescheduling(false);
    }
  };

  const handleLaunchNow = async (campaignId: string) => {
    if (!window.confirm('Trigger this campaign to dispatch immediately to all recipients?')) return;
    try {
      const res = await fetch(`${API}/api/v1/campaigns/${campaignId}/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setActionMsg({ text: 'Campaign launched successfully!', type: 'success' });
        setSelectedEvent(null);
        fetchEvents();
      } else {
        const d = await res.json();
        setActionMsg({ text: extractErrorMessage(d, 'Failed to launch'), type: 'error' });
      }
    } catch {
      setActionMsg({ text: 'Network error', type: 'error' });
    }
  };

  const handleCancelCampaign = async (campaignId: string) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled campaign?')) return;
    try {
      const res = await fetch(`${API}/api/v1/campaigns/${campaignId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setActionMsg({ text: 'Campaign cancelled', type: 'success' });
        setSelectedEvent(null);
        fetchEvents();
      } else {
        const d = await res.json();
        setActionMsg({ text: extractErrorMessage(d, 'Failed to cancel'), type: 'error' });
      }
    } catch {
      setActionMsg({ text: 'Network error', type: 'error' });
    }
  };

  // Upcoming scheduled list
  const upcomingScheduled = events
    .filter((e) => e.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_at || 0).getTime() - new Date(b.scheduled_at || 0).getTime());

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {actionMsg && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex justify-between items-center ${
            actionMsg.type === 'success'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
          }`}
        >
          <span>{actionMsg.text}</span>
          <button onClick={() => setActionMsg(null)} className="text-xs font-bold px-2 py-0.5">✕</button>
        </div>
      )}

      {/* Header Bar */}
      <div className="glass-panel p-5 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>📅</span> Campaign Scheduler &amp; Calendar
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Plan, visualize, and reschedule your automated WhatsApp campaign dispatches on an interactive timeline.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenCreateModal}
            className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg shadow-emerald-500/25 flex items-center gap-1.5"
          >
            <span>+</span> <span>Schedule Campaign</span>
          </button>
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="glass-panel hover:bg-white/10 text-white px-3 py-2 rounded-xl text-xs border border-white/10 transition"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Main Grid: Calendar on Left, Upcoming Queue on Right */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Calendar View (Span 2 cols on xl) */}
        <div className="xl:col-span-2 glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-4">
          {/* Calendar Controls */}
          <div className="flex justify-between items-center border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold text-white tracking-wide">
                {monthNames[month]} {year}
              </h3>
              <button
                onClick={goToToday}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-medium transition"
              >
                Today
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={prevMonth}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center border border-white/10 transition text-sm"
              >
                ◀
              </button>
              <button
                onClick={nextMonth}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center border border-white/10 transition text-sm"
              >
                ▶
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="py-1">{day}</div>
            ))}
          </div>

          {/* Day Cells Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarCells.map((cell, idx) => {
              const dayEvents = getEventsForDate(cell.date);
              const isSelected =
                selectedDayEvents &&
                selectedDayEvents.date.getDate() === cell.date.getDate() &&
                selectedDayEvents.date.getMonth() === cell.date.getMonth();

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDayEvents({ date: cell.date, events: dayEvents })}
                  className={`min-h-[96px] p-1.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                    cell.isCurrentMonth ? 'bg-slate-900/50' : 'bg-slate-950/20 opacity-40'
                  } ${
                    cell.isToday
                      ? 'border-emerald-500/70 shadow-md shadow-emerald-500/10'
                      : isSelected
                      ? 'border-blue-400 bg-blue-500/5'
                      : 'border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span
                      className={`text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center ${
                        cell.isToday
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : cell.isCurrentMonth
                          ? 'text-slate-300'
                          : 'text-slate-600'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-white/5 px-1 rounded">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  {/* Badges Preview */}
                  <div className="space-y-1 mt-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => {
                      const badge = getStatusBadge(ev.status);
                      const timeStr = ev.scheduled_at
                        ? new Date(ev.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '';
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(ev);
                          }}
                          className={`text-[10px] truncate px-1.5 py-0.5 rounded border font-medium flex items-center gap-1 ${badge.bg}`}
                          title={`${ev.name} (${ev.status})`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${badge.dot}`} />
                          <span className="truncate">{ev.name}</span>
                          {timeStr && <span className="text-[9px] opacity-75 ml-auto font-mono">{timeStr}</span>}
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <p className="text-[9px] text-slate-400 pl-1 font-semibold">
                        +{dayEvents.length - 2} more...
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar: Upcoming Scheduled Campaigns Queue */}
        <div className="space-y-6">
          <div className="glass-panel p-5 rounded-2xl border border-white/10 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>⏰</span> Upcoming Dispatches
              </h3>
              <span className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                {upcomingScheduled.length} queued
              </span>
            </div>

            {upcomingScheduled.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                No campaigns currently queued. Click <strong>+ Schedule Campaign</strong> to set up an automated future broadcast.
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {upcomingScheduled.map((ev) => {
                  const schedDate = new Date(ev.scheduled_at || 0);
                  const isPast = schedDate.getTime() <= Date.now();
                  return (
                    <div
                      key={ev.id}
                      onClick={() => setSelectedEvent(ev)}
                      className="p-3.5 rounded-xl border border-white/10 bg-slate-900/60 hover:border-blue-500/40 cursor-pointer transition space-y-2"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="text-sm font-bold text-white truncate">{ev.name}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30 flex-shrink-0">
                          {isPast ? 'Executing...' : 'Scheduled'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                        <span>📅 {schedDate.toLocaleDateString()}</span>
                        <span>🕒 {schedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <div className="flex justify-between items-center text-xs text-slate-400 border-t border-white/5 pt-2">
                        <span>Recipients: <strong className="text-white font-mono">{ev.total_messages.toLocaleString()}</strong></span>
                        <span className="text-blue-400 hover:underline text-[11px]">View details →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Campaign Details & Reschedule */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-panel border border-white/20 rounded-2xl w-full max-w-lg p-6 shadow-2xl bg-slate-900/95 space-y-4">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Campaign Details</span>
                <h3 className="text-lg font-bold text-white mt-0.5">{selectedEvent.name}</h3>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="text-slate-400 hover:text-white font-bold text-lg">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-white/5">
                <div>
                  <span className="text-slate-400">Current Status:</span>
                  <p className="font-bold text-white uppercase mt-0.5">{selectedEvent.status}</p>
                </div>
                <div>
                  <span className="text-slate-400">Target Recipients:</span>
                  <p className="font-bold text-emerald-400 font-mono mt-0.5">{selectedEvent.total_messages.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-slate-400">Scheduled For:</span>
                  <p className="font-mono text-cyan-300 mt-0.5">
                    {selectedEvent.scheduled_at ? new Date(selectedEvent.scheduled_at).toLocaleString() : 'Immediate dispatch'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Created:</span>
                  <p className="font-mono text-slate-300 mt-0.5">{new Date(selectedEvent.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {selectedEvent.message_body && (
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/5">
                  <span className="text-[11px] font-semibold text-slate-400">Message Content:</span>
                  <p className="text-slate-200 mt-1 whitespace-pre-wrap">{selectedEvent.message_body}</p>
                </div>
              )}

              {/* Reschedule Section (available if scheduled) */}
              {selectedEvent.status === 'scheduled' && (
                <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20 space-y-3">
                  <h4 className="font-bold text-blue-300 text-xs flex items-center gap-1.5">
                    <span>⏰</span> Reschedule Campaign
                  </h4>
                  <input
                    type="datetime-local"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 text-white rounded-lg border border-white/10 text-xs focus:border-blue-500 outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReschedule(selectedEvent.id)}
                      disabled={rescheduling}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg text-xs transition"
                    >
                      {rescheduling ? 'Rescheduling...' : 'Save New Time'}
                    </button>
                    <button
                      onClick={() => handleLaunchNow(selectedEvent.id)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-2 rounded-lg text-xs transition"
                    >
                      🚀 Send Now
                    </button>
                    <button
                      onClick={() => handleCancelCampaign(selectedEvent.id)}
                      className="bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white font-semibold px-3 py-2 rounded-lg text-xs transition border border-rose-500/30"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
