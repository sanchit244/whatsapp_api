import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const auth = React.useContext(AuthContext);
  const [stats] = useState({
    totalUsers: 1055,
    totalCampaigns: 342,
    totalMessages: 15000000,
    revenue: 285000,
  });

  useEffect(() => {
    if (!auth?.token) {
      navigate('/login');
    }
  }, [auth?.token, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      {/* Navbar */}
      <nav className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <button
            onClick={() => {
              auth?.logout();
              navigate('/login');
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-8">
        <h2 className="text-3xl font-bold text-white mb-8">Welcome to Admin Panel</h2>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Users" value={stats.totalUsers.toLocaleString()} color="bg-blue-600" />
          <StatCard title="Campaigns" value={stats.totalCampaigns.toLocaleString()} color="bg-green-600" />
          <StatCard title="Messages Sent" value={(stats.totalMessages / 1000000).toFixed(1) + 'M'} color="bg-purple-600" />
          <StatCard title="Revenue" value={'$' + (stats.revenue / 1000).toFixed(0) + 'K'} color="bg-orange-600" />
        </div>

        {/* Content Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Users Section */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Recent Users</h3>
            <div className="space-y-3">
              <UserItem name="John Doe" email="john@example.com" status="Active" />
              <UserItem name="Jane Smith" email="jane@example.com" status="Active" />
              <UserItem name="Bob Wilson" email="bob@example.com" status="Inactive" />
            </div>
          </div>

          {/* Campaigns Section */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Recent Campaigns</h3>
            <div className="space-y-3">
              <CampaignItem name="Summer Sale" status="Active" messages="5000" />
              <CampaignItem name="Black Friday" status="Draft" messages="0" />
              <CampaignItem name="Holiday Promo" status="Completed" messages="12000" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string; color: string }> = ({ title, value, color }) => (
  <div className={`${color} p-6 rounded-lg text-white`}>
    <p className="text-sm font-semibold opacity-90">{title}</p>
    <p className="text-3xl font-bold mt-2">{value}</p>
  </div>
);

const UserItem: React.FC<{ name: string; email: string; status: string }> = ({ name, email, status }) => (
  <div className="flex justify-between items-center p-3 bg-gray-700 rounded">
    <div>
      <p className="text-white font-semibold">{name}</p>
      <p className="text-gray-400 text-sm">{email}</p>
    </div>
    <span className={`px-3 py-1 rounded text-sm ${status === 'Active' ? 'bg-green-600' : 'bg-gray-600'} text-white`}>
      {status}
    </span>
  </div>
);

const CampaignItem: React.FC<{ name: string; status: string; messages: string }> = ({ name, status, messages }) => (
  <div className="flex justify-between items-center p-3 bg-gray-700 rounded">
    <div>
      <p className="text-white font-semibold">{name}</p>
      <p className="text-gray-400 text-sm">{messages} messages</p>
    </div>
    <span className={`px-3 py-1 rounded text-sm ${
      status === 'Active' ? 'bg-green-600' : status === 'Draft' ? 'bg-yellow-600' : 'bg-blue-600'
    } text-white`}>
      {status}
    </span>
  </div>
);
