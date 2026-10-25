import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { AnalyticsTab, ContactGroupsTab, InboxTab } from './FeatureTabs';
import { CampaignCalendarTab } from './CampaignCalendarTab';
import { StripeBillingTab } from './StripeBillingTab';
import { extractErrorMessage } from '../utils/errorHelper';

export const ClientDashboard: React.FC = () => {
  const navigate = useNavigate();
  const auth = React.useContext(AuthContext);

  // Navigation tab & Mobile Hamburger state
  const [activeTab, setActiveTab] = useState<'campaigns' | 'whatsapp_config' | 'billing' | 'analytics' | 'groups' | 'inbox' | 'calendar'>('campaigns');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Impersonator state
  const isImpersonating = !!localStorage.getItem('admin_impersonator_token');

  // System Announcement state
  const [announcement, setAnnouncement] = useState<{ active?: boolean; message?: string; level?: 'info' | 'warning' | 'critical' } | null>(null);

  // Campaigns state
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [campaignMessages, setCampaignMessages] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(false);

  // New Campaign modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    message_type: 'text' as 'text' | 'image' | 'video' | 'document' | 'template',
    message: '',
    template_name: 'welcome_greeting',
    contactsText: '',
    media_url: '',
    media_type: 'image' as 'image' | 'video' | 'document',
    isScheduled: false,
    scheduled_at: '',
  });
  const [campaignMediaUploading, setCampaignMediaUploading] = useState<boolean>(false);
  const [uploadedCount, setUploadedCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const campaignMediaFileRef = useRef<HTMLInputElement>(null);

  // WhatsApp BYOK settings state
  const [whatsappConfig, setWhatsappConfig] = useState({
    use_custom_whatsapp: false,
    phone_number_id: '',
    business_account_id: '',
    whatsapp_token: '',
    token_masked: '',
    has_platform_default: true,
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // Test single send state
  const [testSend, setTestSend] = useState({
    recipient: '',
    message: 'Hello! This is a test message from WhatsApp Bulk Sender.',
    message_type: 'text' as 'text' | 'image' | 'video' | 'document',
    media_url: '',
    media_type: 'image' as 'image' | 'video' | 'document',
  });
  const [testMediaUploading, setTestMediaUploading] = useState<boolean>(false);
  const [testSendStatus, setTestSendStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [testSending, setTestSending] = useState(false);
  const testMediaFileRef = useRef<HTMLInputElement>(null);

  // Fetch campaigns
  const fetchCampaigns = async () => {
    if (!auth?.token) return;
    try {
      const res = await fetch('http://localhost:3000/api/v1/campaigns', {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = await res.json();
      if (res.ok && data.data?.campaigns) {
        setCampaigns(data.data.campaigns);
      }
    } catch (err) {
      console.error('Failed to load campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch WhatsApp Config
  const fetchWhatsappConfig = async () => {
    if (!auth?.token) return;
    try {
      const res = await fetch('http://localhost:3000/api/v1/whatsapp/config', {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setWhatsappConfig({
          use_custom_whatsapp: data.use_custom_whatsapp,
          phone_number_id: data.phone_number_id || '',
          business_account_id: data.business_account_id || '',
          whatsapp_token: '',
          token_masked: data.token_masked || '',
          has_platform_default: data.has_platform_default,
        });
      }
    } catch (err) {
      console.error('Failed to load WhatsApp config:', err);
    }
  };

  // Fetch campaign messages details
  const fetchCampaignMessages = async (campaignId: string) => {
    if (!auth?.token) return;
    setMessagesLoading(true);
    try {
      const res = await fetch(`http://localhost:3000/api/v1/campaigns/${campaignId}/messages`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const data = await res.json();
      if (res.ok && data.messages) {
        setCampaignMessages(data.messages);
      }
    } catch (err) {
      console.error('Failed to load campaign messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchWhatsappConfig();

    // Check system announcement
    const checkAnnouncement = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/v1/announcement');
        const data = await res.json();
        if (res.ok && data.active) {
          setAnnouncement(data);
        }
      } catch {
        // silent
      }
    };
    checkAnnouncement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token]);

  // Handle CSV file upload for campaign contacts
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text
        .split('\n')
        .map((l) => l.trim().replace(/^["']|["']$/g, ''))
        .filter((l) => l.length > 5);

      const uniqueNumbers = Array.from(new Set(lines));
      setCampaignForm((prev) => ({
        ...prev,
        contactsText: uniqueNumbers.join('\n'),
      }));
      setUploadedCount(uniqueNumbers.length);
    };
    reader.readAsText(file);
  };

  // Handle Media File Upload (Images / Videos / Documents)
  const handleUploadMedia = async (file: File, target: 'campaign' | 'test') => {
    if (target === 'campaign') setCampaignMediaUploading(true);
    else setTestMediaUploading(true);

    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (target === 'campaign') {
          setCampaignForm((prev) => ({ ...prev, media_url: base64String }));
          setCampaignMediaUploading(false);
        } else {
          setTestSend((prev) => ({ ...prev, media_url: base64String }));
          setTestMediaUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      if (target === 'campaign') setCampaignMediaUploading(false);
      else setTestMediaUploading(false);
    }
  };

  // Handle Create & Launch Campaign
  const handleLaunchCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    const contacts = campaignForm.contactsText
      .split('\n')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (contacts.length === 0) {
      alert('Please add at least one recipient phone number');
      return;
    }

    try {
      const res = await fetch('http://localhost:3000/api/v1/campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth?.token}`,
        },
        body: JSON.stringify({
          name: campaignForm.name,
          message_type: campaignForm.message_type,
          message: campaignForm.message,
          template_name: campaignForm.message_type === 'template' ? campaignForm.template_name : undefined,
          media_url: (campaignForm.message_type === 'image' || campaignForm.message_type === 'video' || campaignForm.message_type === 'document') ? campaignForm.media_url : undefined,
          media_type: campaignForm.media_type,
          contacts,
          scheduled_at: campaignForm.isScheduled && campaignForm.scheduled_at ? campaignForm.scheduled_at : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message || (campaignForm.isScheduled ? '📅 Campaign scheduled successfully!' : '🎉 Bulk campaign launched successfully!'));
        setShowCreateModal(false);
        setCampaignForm({
          name: '',
          message_type: 'text',
          message: '',
          template_name: 'welcome_greeting',
          contactsText: '',
          media_url: '',
          media_type: 'image',
          isScheduled: false,
          scheduled_at: '',
        });
        setUploadedCount(0);
        fetchCampaigns();
      } else {
        alert(extractErrorMessage(data, 'Failed to create campaign'));
      }
    } catch {
      alert('Network error while launching campaign');
    }
  };

  // Handle Save WhatsApp BYOK Config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setVerifyStatus(null);

    try {
      const res = await fetch('http://localhost:3000/api/v1/whatsapp/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth?.token}`,
        },
        body: JSON.stringify(whatsappConfig),
      });

      const data = await res.json();
      if (res.ok) {
        setVerifyStatus({ success: true, message: 'WhatsApp configuration saved!' });
        fetchWhatsappConfig();
      } else {
        setVerifyStatus({ success: false, message: extractErrorMessage(data, 'Failed to save config') });
      }
    } catch (err: any) {
      setVerifyStatus({ success: false, message: err.message });
    } finally {
      setConfigSaving(false);
    }
  };

  // Handle Verify Credentials
  const handleVerifyCredentials = async () => {
    if (!whatsappConfig.whatsapp_token || !whatsappConfig.phone_number_id) {
      alert('Please enter your WhatsApp Token and Phone Number ID to verify');
      return;
    }

    setVerifyStatus({ message: 'Verifying with Meta Graph API...' });
    try {
      const res = await fetch('http://localhost:3000/api/v1/whatsapp/verify-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth?.token}`,
        },
        body: JSON.stringify({
          token: whatsappConfig.whatsapp_token,
          phone_number_id: whatsappConfig.phone_number_id,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setVerifyStatus({ success: true, message: '✅ Meta Cloud API connection verified successfully!' });
      } else {
        setVerifyStatus({ success: false, message: `❌ Meta API Error: ${extractErrorMessage(data, 'Verification failed')}` });
      }
    } catch (err: any) {
      setVerifyStatus({ success: false, message: `Verification failed: ${err.message}` });
    }
  };

  // Handle Send Test Message
  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestSending(true);
    setTestSendStatus(null);

    try {
      const res = await fetch('http://localhost:3000/api/v1/whatsapp/test-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth?.token}`,
        },
        body: JSON.stringify(testSend),
      });

      const data = await res.json();
      if (res.ok) {
        setTestSendStatus({
          success: true,
          message: `✅ Message sent! Status: ${data.status} (ID: ${data.messageId || 'N/A'})`,
        });
      } else {
        setTestSendStatus({
          success: false,
          message: `❌ Failed: ${extractErrorMessage(data, 'Failed to send message')}`,
        });
      }
    } catch (err: any) {
      setTestSendStatus({ success: false, message: err.message });
    } finally {
      setTestSending(false);
    }
  };

  // Calculate live stats
  const totalCampaigns = campaigns.length;
  const totalSent = campaigns.reduce((acc, c) => acc + (parseInt(c.messages_sent) || 0), 0);
  const totalDelivered = campaigns.reduce((acc, c) => acc + (parseInt(c.messages_delivered) || 0), 0);
  const activeCount = campaigns.filter((c) => c.status === 'active').length;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans relative overflow-x-hidden selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Background Grid Pattern & Ambient Glowing Orbs */}
      <div className="fixed inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />
      <div className="fixed -top-40 -left-40 w-96 h-96 bg-emerald-500/15 rounded-full blur-[100px] pointer-events-none animate-float" />
      <div className="fixed top-1/3 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none animate-float-reverse" />
      <div className="fixed -bottom-40 left-1/3 w-96 h-96 bg-indigo-500/15 rounded-full blur-[130px] pointer-events-none animate-pulse-glow" />

      {/* Top Navbar */}
      <nav className="glass-panel sticky top-0 z-30 px-6 py-4 flex justify-between items-center border-b border-white/10 backdrop-blur-2xl bg-slate-950/80 shadow-2xl">
        <div className="flex items-center space-x-3.5">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-400 via-teal-500 to-cyan-400 flex items-center justify-center font-black text-slate-950 text-base shadow-xl shadow-emerald-500/30">
              WA
            </div>
            <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-400 border-2 border-[#070b14] rounded-full animate-ping" />
            <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-[#070b14] rounded-full" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-extrabold text-white tracking-wide">WhatsApp Bulk Dispatcher</h1>
              <span className="hidden sm:inline-block px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Client Portal
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Meta Cloud API High-Throughput Campaign Engine</p>
          </div>
        </div>

        {/* Desktop Nav Actions */}
        <div className="hidden lg:flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'campaigns'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>📊</span> Campaigns
          </button>
          <button
            onClick={() => setActiveTab('whatsapp_config')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'whatsapp_config'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>⚙️</span> API (BYOK)
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'billing'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>💳</span> Billing
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'analytics'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>📈</span> Analytics
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'groups'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>👥</span> Groups
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'inbox'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>💬</span> Inbox
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-1.5 ${
              activeTab === 'calendar'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
            }`}
          >
            <span>📅</span> Calendar
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 hover:from-emerald-400 hover:to-cyan-300 text-slate-950 font-extrabold px-4 py-2 rounded-xl text-xs transition shadow-lg shadow-emerald-500/30 flex items-center space-x-1.5 active:scale-95 ml-2"
          >
            <span>+</span> <span>New Campaign</span>
          </button>
          <button
            onClick={() => {
              auth?.logout();
              navigate('/');
            }}
            className="glass-panel hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 px-3.5 py-2 rounded-xl text-xs transition font-semibold ml-1"
          >
            Logout
          </button>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex items-center space-x-2 lg:hidden">
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs shadow-md shadow-emerald-500/20"
          >
            + New
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2.5 rounded-xl glass-panel text-slate-200 hover:text-white border border-white/10 focus:outline-none transition active:scale-95"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? (
              <span className="text-lg font-bold text-emerald-400">✕</span>
            ) : (
              <div className="space-y-1 w-5">
                <div className="h-0.5 bg-white w-full rounded-full" />
                <div className="h-0.5 bg-white w-full rounded-full" />
                <div className="h-0.5 bg-white w-full rounded-full" />
              </div>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Hamburger Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden glass-panel border-b border-white/10 bg-slate-950/95 px-6 py-5 space-y-3 sticky top-[73px] z-20 shadow-2xl animate-in slide-in-from-top duration-200">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setActiveTab('campaigns'); setMobileMenuOpen(false); }}
              className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition ${activeTab === 'campaigns' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900/60 text-slate-300 border border-white/5'}`}
            >
              <span>📊</span> Campaigns
            </button>
            <button
              onClick={() => { setActiveTab('whatsapp_config'); setMobileMenuOpen(false); }}
              className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition ${activeTab === 'whatsapp_config' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900/60 text-slate-300 border border-white/5'}`}
            >
              <span>⚙️</span> API Settings
            </button>
            <button
              onClick={() => { setActiveTab('billing'); setMobileMenuOpen(false); }}
              className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition ${activeTab === 'billing' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900/60 text-slate-300 border border-white/5'}`}
            >
              <span>💳</span> Billing &amp; Stripe
            </button>
            <button
              onClick={() => { setActiveTab('analytics'); setMobileMenuOpen(false); }}
              className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition ${activeTab === 'analytics' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900/60 text-slate-300 border border-white/5'}`}
            >
              <span>📈</span> Analytics
            </button>
            <button
              onClick={() => { setActiveTab('groups'); setMobileMenuOpen(false); }}
              className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition ${activeTab === 'groups' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900/60 text-slate-300 border border-white/5'}`}
            >
              <span>👥</span> Contact Groups
            </button>
            <button
              onClick={() => { setActiveTab('inbox'); setMobileMenuOpen(false); }}
              className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition ${activeTab === 'inbox' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900/60 text-slate-300 border border-white/5'}`}
            >
              <span>💬</span> Live Inbox
            </button>
            <button
              onClick={() => { setActiveTab('calendar'); setMobileMenuOpen(false); }}
              className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2 transition col-span-2 ${activeTab === 'calendar' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900/60 text-slate-300 border border-white/5'}`}
            >
              <span>📅</span> Campaign Calendar
            </button>
          </div>
          <div className="pt-2 border-t border-white/10 flex gap-2">
            <button
              onClick={() => {
                auth?.logout();
                navigate('/');
              }}
              className="w-full py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition"
            >
              🚪 Logout
            </button>
          </div>
        </div>
      )}

      {/* Impersonator Exit Banner */}
      {isImpersonating && (
        <div className="bg-gradient-to-r from-amber-600 via-rose-600 to-amber-700 px-6 py-2.5 flex items-center justify-between text-xs font-bold text-white shadow-xl sticky top-[73px] z-20 border-b border-amber-400/40">
          <div className="flex items-center gap-2.5">
            <span className="text-base animate-bounce">🕶️</span>
            <span>ADMIN IMPERSONATION MODE: Viewing and operating this client account with administrative privileges.</span>
          </div>
          <button
            onClick={() => {
              const adminTok = localStorage.getItem('admin_impersonator_token');
              if (adminTok) {
                localStorage.setItem('token', adminTok);
                localStorage.setItem('portal', 'admin');
                localStorage.removeItem('admin_impersonator_token');
                window.location.href = '/dashboard';
              }
            }}
            className="bg-slate-950/90 hover:bg-slate-950 text-amber-300 px-4 py-1.5 rounded-xl border border-amber-400/50 text-xs font-black transition shadow hover:scale-105"
          >
            Exit Impersonation &rarr;
          </button>
        </div>
      )}

      {/* Global System Announcement Banner */}
      {announcement && announcement.active && announcement.message && (
        <div
          className={`px-6 py-2.5 flex items-center justify-between text-xs font-medium border-b backdrop-blur-md transition-all sticky ${
            isImpersonating ? 'top-[112px]' : 'top-[73px]'
          } z-20 ${
            announcement.level === 'critical'
              ? 'bg-rose-500/20 border-rose-500/40 text-rose-200 shadow-rose-950/50'
              : announcement.level === 'warning'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-200 shadow-amber-950/50'
              : 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200 shadow-indigo-950/50'
          }`}
        >
          <div className="flex items-center gap-2.5 max-w-5xl">
            <span className="text-sm">
              {announcement.level === 'critical' ? '🚨' : announcement.level === 'warning' ? '⚠️' : '📢'}
            </span>
            <span
              className={`font-black uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full border ${
                announcement.level === 'critical'
                  ? 'bg-rose-500/30 border-rose-400/40 text-rose-200'
                  : announcement.level === 'warning'
                  ? 'bg-amber-500/30 border-amber-400/40 text-amber-200'
                  : 'bg-indigo-500/30 border-indigo-400/40 text-indigo-200'
              }`}
            >
              {announcement.level || 'Announcement'}
            </span>
            <span className="text-slate-100 font-semibold">{announcement.message}</span>
          </div>
          <button
            onClick={() => setAnnouncement(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-0.5 rounded hover:bg-white/10 transition"
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full p-6 space-y-6 flex-1 relative z-10">
        {/* Tab 1: Campaigns */}
        {activeTab === 'campaigns' && (
          <>
            {/* Live Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-panel p-5 rounded-2xl border border-white/10 hover:border-emerald-500/30 transition-all duration-300 relative overflow-hidden group shadow-xl">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Total Campaigns</span>
                <p className="text-3xl font-extrabold text-white mt-2 font-mono tracking-tight">{totalCampaigns}</p>
                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {activeCount} currently dispatching
                </p>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-white/10 hover:border-blue-500/30 transition-all duration-300 relative overflow-hidden group shadow-xl">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Dispatched Messages</span>
                <p className="text-3xl font-extrabold text-blue-400 mt-2 font-mono tracking-tight">{totalSent.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">Across all bulk batches</p>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-white/10 hover:border-teal-500/30 transition-all duration-300 relative overflow-hidden group shadow-xl">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-teal-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Confirmed Delivered</span>
                <p className="text-3xl font-extrabold text-emerald-400 mt-2 font-mono tracking-tight">{totalDelivered.toLocaleString()}</p>
                <p className="text-xs text-slate-400 mt-1">Verified by Meta Webhook</p>
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-white/10 hover:border-purple-500/30 transition-all duration-300 relative overflow-hidden group shadow-xl">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Meta Sender Mode</span>
                <p className="text-lg font-bold text-purple-300 mt-2.5">
                  {whatsappConfig.use_custom_whatsapp ? 'Custom BYOK Key' : 'Platform Default'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {whatsappConfig.use_custom_whatsapp ? 'Dedicated WABA ID' : 'Managed Meta Pool'}
                </p>
              </div>
            </div>

            {/* Campaigns Table */}
            <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-slate-900/40">
                <div>
                  <h2 className="text-base font-bold text-white">Your Bulk Campaigns</h2>
                  <p className="text-xs text-slate-400">Monitor dispatch status, progress rates, and delivery confirmations</p>
                </div>
                <button
                  onClick={fetchCampaigns}
                  className="text-xs text-slate-300 hover:text-white glass-panel px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition flex items-center gap-1.5"
                >
                  <span>🔄</span> Refresh
                </button>
              </div>

              {loading ? (
                <div className="p-12 text-center text-slate-400">Loading campaigns...</div>
              ) : campaigns.length === 0 ? (
                <div className="p-14 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto text-3xl">
                    🚀
                  </div>
                  <div className="space-y-1">
                    <p className="text-white text-base font-bold">No campaigns dispatched yet.</p>
                    <p className="text-xs text-slate-400">Create your first broadcast to reach thousands of WhatsApp contacts in minutes.</p>
                  </div>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition shadow-lg shadow-emerald-500/20"
                  >
                    Launch Your First Bulk Campaign
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900/60 text-[11px] uppercase text-slate-400 font-semibold border-b border-white/10 tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Campaign Name</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5">Total Contacts</th>
                        <th className="px-6 py-3.5">Sent / Progress</th>
                        <th className="px-6 py-3.5">Delivered</th>
                        <th className="px-6 py-3.5">Created At</th>
                        <th className="px-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {campaigns.map((camp) => {
                        const total = camp.total_messages || 0;
                        const sent = camp.messages_sent || 0;
                        const pct = total > 0 ? Math.min(100, Math.round((sent / total) * 100)) : 0;

                        return (
                          <tr key={camp.id} className="hover:bg-white/[0.02] transition">
                            <td className="px-6 py-4 font-semibold text-white">{camp.name}</td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 ${
                                  camp.status === 'completed'
                                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                    : camp.status === 'active'
                                    ? 'bg-blue-500/10 text-blue-300 border border-blue-500/30 animate-pulse'
                                    : camp.status === 'failed'
                                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${camp.status === 'completed' ? 'bg-emerald-400' : camp.status === 'active' ? 'bg-blue-400' : camp.status === 'failed' ? 'bg-rose-400' : 'bg-amber-400'}`} />
                                {camp.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono">{total.toLocaleString()}</td>
                            <td className="px-6 py-4 w-48">
                              <div className="flex items-center space-x-2.5">
                                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-white/5">
                                  <div
                                    className={`h-2 rounded-full transition-all duration-500 ${camp.status === 'active' ? 'bg-gradient-to-r from-blue-500 to-cyan-400' : 'bg-gradient-to-r from-emerald-500 to-teal-400'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-slate-400 font-mono">{pct}%</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-emerald-400 font-mono">
                              {(camp.messages_delivered || 0).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-400">
                              {new Date(camp.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  setSelectedCampaign(camp);
                                  fetchCampaignMessages(camp.id);
                                }}
                                className="glass-panel hover:bg-white/10 text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-white/10 transition font-medium"
                              >
                                View Logs
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab 2: WhatsApp BYOK Config */}
        {activeTab === 'whatsapp_config' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Credential Settings */}
            <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white">Meta WhatsApp Cloud API Settings</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    BYOK Enabled
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  Select whether to send using the platform's default Meta API pool or connect your own verified WhatsApp Business number (BYOK).
                </p>
              </div>

              <form onSubmit={handleSaveConfig} className="space-y-5">
                {/* Mode Selector */}
                <div className="bg-slate-950/60 p-4 rounded-xl border border-white/10 space-y-3">
                  <label className="flex items-center space-x-3.5 cursor-pointer">
                    <input
                      type="radio"
                      name="api_mode"
                      checked={!whatsappConfig.use_custom_whatsapp}
                      onChange={() => setWhatsappConfig({ ...whatsappConfig, use_custom_whatsapp: false })}
                      className="text-emerald-500 focus:ring-emerald-400 h-4 w-4"
                    />
                    <div>
                      <p className="font-semibold text-white text-sm">Platform Default Meta API Pool</p>
                      <p className="text-xs text-slate-400">Uses platform-managed WhatsApp sender credentials (zero configuration required).</p>
                    </div>
                  </label>

                  <label className="flex items-center space-x-3.5 cursor-pointer pt-3 border-t border-white/5">
                    <input
                      type="radio"
                      name="api_mode"
                      checked={whatsappConfig.use_custom_whatsapp}
                      onChange={() => setWhatsappConfig({ ...whatsappConfig, use_custom_whatsapp: true })}
                      className="text-emerald-500 focus:ring-emerald-400 h-4 w-4"
                    />
                    <div>
                      <p className="font-semibold text-white text-sm">Custom Meta API Credentials (BYOK)</p>
                      <p className="text-xs text-slate-400">Use your own Meta Developer App, Phone Number ID, and System User Token.</p>
                    </div>
                  </label>
                </div>

                {whatsappConfig.use_custom_whatsapp && (
                  <div className="space-y-4 pt-1">
                    <div>
                      <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                        Meta Permanent Access Token
                      </label>
                      <input
                        type="password"
                        placeholder={whatsappConfig.token_masked || 'EAAB... (Paste System User Access Token)'}
                        value={whatsappConfig.whatsapp_token}
                        onChange={(e) => setWhatsappConfig({ ...whatsappConfig, whatsapp_token: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-900/80 text-white rounded-xl border border-white/10 text-sm focus:border-emerald-500 outline-none transition"
                      />
                      <p className="text-xs text-slate-400 mt-1">Generated from Facebook Business Manager System Users.</p>
                    </div>

                    <div>
                      <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                        WhatsApp Phone Number ID
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 109876543210987"
                        value={whatsappConfig.phone_number_id}
                        onChange={(e) => setWhatsappConfig({ ...whatsappConfig, phone_number_id: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-900/80 text-white rounded-xl border border-white/10 text-sm focus:border-emerald-500 outline-none transition font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                        WhatsApp Business Account ID (WABA ID - Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 209876543210987"
                        value={whatsappConfig.business_account_id}
                        onChange={(e) => setWhatsappConfig({ ...whatsappConfig, business_account_id: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-slate-900/80 text-white rounded-xl border border-white/10 text-sm focus:border-emerald-500 outline-none transition font-mono"
                      />
                    </div>

                    <div className="flex space-x-3 pt-1">
                      <button
                        type="button"
                        onClick={handleVerifyCredentials}
                        className="bg-blue-600/30 hover:bg-blue-600 text-blue-200 hover:text-white border border-blue-500/30 text-xs font-semibold px-4 py-2 rounded-xl transition"
                      >
                        Verify Meta Token
                      </button>
                    </div>
                  </div>
                )}

                {verifyStatus && (
                  <div
                    className={`p-3.5 rounded-xl text-xs font-medium border ${
                      verifyStatus.success ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {verifyStatus.message}
                  </div>
                )}

                <div className="pt-3 border-t border-white/10">
                  <button
                    type="submit"
                    disabled={configSaving}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                  >
                    {configSaving ? 'Saving Configuration...' : 'Save WhatsApp Configuration'}
                  </button>
                </div>
              </form>
            </div>

            {/* Right: Test Outbound Message */}
            <div className="glass-panel p-6 rounded-2xl border border-white/10 shadow-2xl space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🚀</span> Send Test WhatsApp Message
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  Dispatch an immediate one-off message to any mobile number to verify that your active credentials and phone number ID are delivering successfully.
                </p>
              </div>

              <form onSubmit={handleSendTestMessage} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                    Recipient Phone Number (with Country Code)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +14155552671 or 919876543210"
                    value={testSend.recipient}
                    onChange={(e) => setTestSend({ ...testSend, recipient: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-900/80 text-white rounded-xl border border-white/10 text-sm focus:border-emerald-500 outline-none transition font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                    Message Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setTestSend({ ...testSend, message_type: 'text' })}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                        testSend.message_type === 'text'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'glass-panel text-slate-300 border-white/5 hover:border-white/10'
                      }`}
                    >
                      💬 Text Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestSend({ ...testSend, message_type: 'image', media_type: 'image' })}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                        testSend.message_type === 'image'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'glass-panel text-slate-300 border-white/5 hover:border-white/10'
                      }`}
                    >
                      🖼️ Image + Text
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestSend({ ...testSend, message_type: 'video', media_type: 'video' })}
                      className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                        testSend.message_type === 'video'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'glass-panel text-slate-300 border-white/5 hover:border-white/10'
                      }`}
                    >
                      🎥 Video + Text
                    </button>
                  </div>
                </div>

                {/* Media Attachment if Image or Video selected */}
                {testSend.message_type !== 'text' && (
                  <div className="bg-slate-950/60 p-4 rounded-xl border border-white/10 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs uppercase font-bold text-emerald-400">
                        {testSend.message_type === 'image' ? '🖼️ Select Image' : '🎥 Select Video'}
                      </span>
                      <input
                        type="file"
                        ref={testMediaFileRef}
                        accept={testSend.message_type === 'image' ? 'image/*' : 'video/*'}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadMedia(file, 'test');
                        }}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => testMediaFileRef.current?.click()}
                        disabled={testMediaUploading}
                        className="text-xs glass-panel hover:bg-white/10 text-white font-medium px-3 py-1.5 rounded-lg border border-white/10 transition"
                      >
                        {testMediaUploading ? 'Uploading...' : '📁 Upload File from Computer'}
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-300 mb-1">Or Paste Direct Media Link (URL):</label>
                      <input
                        type="url"
                        placeholder="https://example.com/media.jpg or .mp4"
                        value={testSend.media_url}
                        onChange={(e) => setTestSend({ ...testSend, media_url: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-900 text-white rounded-lg border border-white/10 text-xs focus:border-emerald-500 outline-none"
                      />
                    </div>

                    {testSend.media_url && (
                      <div className="mt-2 p-2.5 bg-slate-900 rounded-xl border border-white/10 flex items-center space-x-3">
                        {testSend.message_type === 'image' ? (
                          <img
                            src={testSend.media_url}
                            alt="Media Preview"
                            className="w-16 h-16 object-cover rounded-lg border border-white/10"
                          />
                        ) : (
                          <video
                            src={testSend.media_url}
                            className="w-20 h-16 object-cover rounded-lg border border-white/10"
                            controls
                          />
                        )}
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs font-semibold text-white">Attachment Ready</p>
                          <p className="text-xs text-slate-400 truncate font-mono">{testSend.media_url}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTestSend({ ...testSend, media_url: '' })}
                          className="text-rose-400 hover:text-rose-300 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                    {testSend.message_type !== 'text' ? 'Message Caption' : 'Message Body'}
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter message text or caption..."
                    value={testSend.message}
                    onChange={(e) => setTestSend({ ...testSend, message: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-900/80 text-white rounded-xl border border-white/10 text-sm focus:border-emerald-500 outline-none transition"
                  />
                </div>

                {testSendStatus && (
                  <div
                    className={`p-3.5 rounded-xl text-xs font-medium border ${
                      testSendStatus.success ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {testSendStatus.message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={testSending || testMediaUploading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
                >
                  {testSending ? 'Sending via Meta API...' : '🚀 Dispatch Test Message'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Tab 3: Stripe Billing, Quotas & Top-Ups */}
        {activeTab === 'billing' && (
          <StripeBillingTab token={auth?.token || ''} />
        )}

        {/* Tab 4: Analytics */}
        {activeTab === 'analytics' && (
          <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>📈</span> Analytics Dashboard
            </h2>
            <AnalyticsTab token={auth?.token || ''} />
          </div>
        )}

        {/* Tab 5: Contact Groups */}
        {activeTab === 'groups' && (
          <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-xl" style={{ minHeight: 520 }}>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>👥</span> Contact Groups &amp; CSV Import
            </h2>
            <ContactGroupsTab token={auth?.token || ''} />
          </div>
        )}

        {/* Tab 6: Two-Way Inbox */}
        {activeTab === 'inbox' && (
          <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>💬</span> WhatsApp Inbox
              <span className="text-xs font-normal text-slate-400 ml-2">Incoming customer replies • Real-time</span>
            </h2>
            <InboxTab token={auth?.token || ''} tenantId={auth?.user?.tenant_id} />
          </div>
        )}

        {/* Tab 7: Campaign Scheduler Calendar */}
        {activeTab === 'calendar' && (
          <CampaignCalendarTab token={auth?.token || ''} onOpenCreateModal={() => setShowCreateModal(true)} />
        )}
      </main>

      {/* Modal: Create & Launch New Bulk Campaign */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-panel border border-white/20 rounded-2xl w-full max-w-2xl p-6 shadow-2xl bg-slate-900/95 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>🚀</span> Launch Bulk WhatsApp Campaign
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleLaunchCampaign} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                  Campaign Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Flash Discount Announcement"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-900 text-white rounded-xl border border-white/10 text-sm focus:border-emerald-500 outline-none transition"
                  required
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                  Message Format
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setCampaignForm({ ...campaignForm, message_type: 'text' })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition text-center ${
                      campaignForm.message_type === 'text'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                        : 'glass-panel text-slate-300 border-white/5 hover:border-white/10'
                    }`}
                  >
                    💬 Text Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampaignForm({ ...campaignForm, message_type: 'image', media_type: 'image' })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition text-center ${
                      campaignForm.message_type === 'image'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                        : 'glass-panel text-slate-300 border-white/5 hover:border-white/10'
                    }`}
                  >
                    🖼️ Image + Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampaignForm({ ...campaignForm, message_type: 'video', media_type: 'video' })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition text-center ${
                      campaignForm.message_type === 'video'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                        : 'glass-panel text-slate-300 border-white/5 hover:border-white/10'
                    }`}
                  >
                    🎥 Video + Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setCampaignForm({ ...campaignForm, message_type: 'template' })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition text-center ${
                      campaignForm.message_type === 'template'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                        : 'glass-panel text-slate-300 border-white/5 hover:border-white/10'
                    }`}
                  >
                    📋 Meta Template
                  </button>
                </div>
              </div>

              {/* Media Attachment if Image or Video selected */}
              {(campaignForm.message_type === 'image' || campaignForm.message_type === 'video') && (
                <div className="bg-slate-950/60 p-4 rounded-xl border border-white/10 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase font-bold text-emerald-400">
                      {campaignForm.message_type === 'image' ? '🖼️ Campaign Image' : '🎥 Campaign Video'}
                    </span>
                    <input
                      type="file"
                      ref={campaignMediaFileRef}
                      accept={campaignForm.message_type === 'image' ? 'image/*' : 'video/*'}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadMedia(file, 'campaign');
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => campaignMediaFileRef.current?.click()}
                      disabled={campaignMediaUploading}
                      className="text-xs glass-panel hover:bg-white/10 text-white font-medium px-3 py-1.5 rounded-lg border border-white/10 transition"
                    >
                      {campaignMediaUploading ? 'Uploading Media...' : '📁 Upload File from Computer'}
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Or Paste Direct Media Link (URL):</label>
                    <input
                      type="url"
                      placeholder="https://example.com/promo-banner.jpg or .mp4"
                      value={campaignForm.media_url}
                      onChange={(e) => setCampaignForm({ ...campaignForm, media_url: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 text-white rounded-lg border border-white/10 text-xs focus:border-emerald-500 outline-none"
                    />
                  </div>

                  {campaignForm.media_url && (
                    <div className="mt-2 p-2.5 bg-slate-900 rounded-xl border border-white/10 flex items-center space-x-3">
                      {campaignForm.message_type === 'image' ? (
                        <img
                          src={campaignForm.media_url}
                          alt="Media Preview"
                          className="w-20 h-20 object-cover rounded-lg border border-white/10"
                        />
                      ) : (
                        <video
                          src={campaignForm.media_url}
                          className="w-24 h-20 object-cover rounded-lg border border-white/10"
                          controls
                        />
                      )}
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-semibold text-white">Media Attached & Ready</p>
                        <p className="text-xs text-slate-400 truncate font-mono">{campaignForm.media_url}</p>
                        <p className="text-xs text-emerald-400 mt-1">✓ Valid WhatsApp media format</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCampaignForm({ ...campaignForm, media_url: '' })}
                        className="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 bg-rose-500/10 rounded-lg border border-rose-500/30"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Message Content / Caption */}
              {campaignForm.message_type === 'template' ? (
                <div>
                  <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                    Select Meta Template
                  </label>
                  <select
                    value={campaignForm.template_name}
                    onChange={(e) => setCampaignForm({ ...campaignForm, template_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-900 text-white rounded-xl border border-white/10 text-sm focus:border-emerald-500 outline-none"
                  >
                    <option value="welcome_greeting">welcome_greeting (Marketing)</option>
                    <option value="order_status_update">order_status_update (Utility)</option>
                    <option value="appointment_reminder">appointment_reminder (Utility)</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs uppercase font-semibold text-slate-300 mb-1">
                    {campaignForm.message_type !== 'text' ? 'Message Caption (Delivered with Media)' : 'Message Content'}
                  </label>
                  <textarea
                    rows={3}
                    placeholder={
                      campaignForm.message_type !== 'text'
                        ? 'e.g. Exclusive Offer! Hi {{name}}, check out our latest launch.'
                        : 'Hello {{name}}, we have a special promotion for you this week!'
                    }
                    value={campaignForm.message}
                    onChange={(e) => setCampaignForm({ ...campaignForm, message: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-900 text-white rounded-xl border border-white/10 text-sm focus:border-emerald-500 outline-none transition"
                    required={campaignForm.message_type === 'text'}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Tip: Use <code className="text-emerald-400">{'{{name}}'}</code> for dynamic recipient personalization.
                  </p>
                </div>
              )}

              {/* Live WhatsApp Message Bubble Preview */}
              {(campaignForm.message || campaignForm.media_url) && (
                <div className="bg-slate-950/70 p-4 rounded-xl border border-white/10">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    📱 Live WhatsApp Recipient Preview
                  </span>
                  <div className="mt-2 max-w-sm ml-auto bg-[#005c4b] text-white p-3.5 rounded-2xl rounded-tr-none shadow-xl space-y-2">
                    {campaignForm.media_url && (
                      <div className="overflow-hidden rounded-xl bg-black/30">
                        {campaignForm.message_type === 'video' ? (
                          <video src={campaignForm.media_url} className="w-full max-h-48 object-cover" controls />
                        ) : (
                          <img src={campaignForm.media_url} alt="WhatsApp Preview" className="w-full max-h-48 object-cover" />
                        )}
                      </div>
                    )}
                    {campaignForm.message && (
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">
                        {campaignForm.message.replace(/\{\{name\}\}/gi, 'John Doe')}
                      </p>
                    )}
                    <div className="flex justify-end items-center space-x-1 text-[10px] text-emerald-200/80">
                      <span>12:00 PM</span>
                      <span className="text-cyan-300">✓✓</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Contacts Input */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs uppercase font-semibold text-slate-300">
                    Target Contacts (One number per line)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs glass-panel text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-lg transition"
                    >
                      📁 Upload CSV / TXT
                    </button>
                    {uploadedCount > 0 && (
                      <span className="text-xs text-emerald-400 font-mono font-bold">
                        {uploadedCount} loaded
                      </span>
                    )}
                  </div>
                </div>
                <textarea
                  rows={5}
                  placeholder={`+14155552671\n+919876543210\n+447911123456`}
                  value={campaignForm.contactsText}
                  onChange={(e) => {
                    setCampaignForm({ ...campaignForm, contactsText: e.target.value });
                    const count = e.target.value.split('\n').filter((l) => l.trim().length > 6).length;
                    setUploadedCount(count);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-900 text-white font-mono rounded-xl border border-white/10 text-sm focus:border-emerald-500 outline-none"
                  required
                />
              </div>

              {/* Launch Timing Option: Immediate vs Scheduled */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-semibold text-slate-300 flex items-center gap-1.5">
                    <span>⏰</span> Dispatch Timing
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCampaignForm({ ...campaignForm, isScheduled: false, scheduled_at: '' })}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        !campaignForm.isScheduled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      🚀 Send Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampaignForm({ ...campaignForm, isScheduled: true })}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        campaignForm.isScheduled
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      📅 Schedule for Later
                    </button>
                  </div>
                </div>

                {campaignForm.isScheduled && (
                  <div className="pt-2 border-t border-white/5 space-y-2">
                    <label className="block text-xs text-slate-300">
                      Target Launch Date &amp; Time:
                    </label>
                    <input
                      type="datetime-local"
                      value={campaignForm.scheduled_at}
                      onChange={(e) => setCampaignForm({ ...campaignForm, scheduled_at: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-900 text-white rounded-xl border border-white/10 text-sm focus:border-blue-500 outline-none font-mono"
                      required={campaignForm.isScheduled}
                    />
                    <p className="text-[11px] text-slate-400">
                      The platform background scheduler will automatically start broadcasting to all recipients at the exact scheduled moment.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex space-x-3 pt-3 border-t border-white/10">
                <button
                  type="submit"
                  className={`flex-1 font-bold py-3 rounded-xl text-sm transition shadow-lg ${
                    campaignForm.isScheduled
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-emerald-600/30'
                  }`}
                >
                  {campaignForm.isScheduled ? '📅 Confirm & Schedule Campaign' : '🚀 Launch Bulk Campaign Now'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="glass-panel text-slate-300 hover:text-white px-5 py-3 rounded-xl text-sm transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Campaign Logs / Details */}
      {selectedCampaign && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="glass-panel border border-white/20 rounded-2xl w-full max-w-4xl p-6 shadow-2xl bg-slate-900/95 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>📋</span> {selectedCampaign.name} — Message Delivery Logs
                </h3>
                <p className="text-xs text-slate-400 font-mono">Campaign ID: {selectedCampaign.id}</p>
              </div>
              <button
                onClick={() => setSelectedCampaign(null)}
                className="text-slate-400 hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {messagesLoading ? (
                <div className="p-8 text-center text-slate-400">Loading delivery logs...</div>
              ) : campaignMessages.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No recipient messages logged yet.</div>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 sticky top-0 uppercase text-slate-400 border-b border-white/10 tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Phone Number</th>
                      <th className="px-4 py-3">Format</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Meta Message ID</th>
                      <th className="px-4 py-3">Sent At</th>
                      <th className="px-4 py-3">Delivered At</th>
                      <th className="px-4 py-3">Error Info</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {campaignMessages.map((msg) => (
                      <tr key={msg.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 font-mono text-white">{msg.phone_number}</td>
                        <td className="px-4 py-2.5">
                          {msg.media_url ? (
                            <a
                              href={msg.media_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 font-semibold underline"
                            >
                              <span>{msg.media_type === 'video' ? '🎥 Video' : '🖼️ Image'}</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 text-xs">💬 Text</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              msg.status === 'delivered' || msg.status === 'read'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : msg.status === 'sent'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : msg.status === 'failed'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {msg.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-400 truncate max-w-[120px]">
                          {msg.meta_message_id || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">
                          {msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString() : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-emerald-400 font-mono">
                          {msg.delivered_at ? new Date(msg.delivered_at).toLocaleTimeString() : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-rose-400 truncate max-w-[160px]">
                          {msg.error_message || 'None'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="border-t border-white/10 pt-3 flex justify-end">
              <button
                onClick={() => setSelectedCampaign(null)}
                className="glass-panel text-slate-300 hover:text-white text-xs px-4 py-2 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
