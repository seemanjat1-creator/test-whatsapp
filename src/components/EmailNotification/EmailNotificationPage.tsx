import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailNotificationAPI } from '../../lib/api';
import { 
  Plus, Mail, Edit3, Trash2, TestTube, BarChart3, 
  Clock, CheckCircle, XCircle, AlertCircle, Settings,
  Calendar, Send, Shield, FileSpreadsheet
} from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { workspaceAPI } from '../../lib/api';
import { EmailConfigModal } from './EmailConfigModal';
import { EmailStatsModal } from './EmailStatsModal';
import { formatDate, formatTime } from '../../lib/utils';
import toast from 'react-hot-toast';

export const EmailNotificationPage: React.FC = () => {
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<any>(null);
  const [testingEmail, setTestingEmail] = useState('');
  
  const queryClient = useQueryClient();
  const { currentWorkspace, isCurrentUserAdmin } = useWorkspace();
  const { user } = useAuth();

  const { data: emailConfigs, isLoading } = useQuery({
    queryKey: ['email-configs', currentWorkspace?.id],
    queryFn: () => emailNotificationAPI.getWorkspaceConfigs(currentWorkspace!.id),
    enabled: !!currentWorkspace?.id,
  });

  const { data: emailLogs } = useQuery({
    queryKey: ['email-logs', currentWorkspace?.id],
    queryFn: () => emailNotificationAPI.getEmailLogs(currentWorkspace!.id, 10),
    enabled: !!currentWorkspace?.id,
  });

  const { data: systemStatus } = useQuery({
    queryKey: ['email-system-status'],
    queryFn: () => emailNotificationAPI.getSystemStatus(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const deleteConfigMutation = useMutation({
    mutationFn: (configId: string) => emailNotificationAPI.deleteConfig(configId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-configs'] });
      toast.success('Email configuration deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete configuration');
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: ({ email }: { email: string }) => 
      emailNotificationAPI.testEmail(currentWorkspace!.id, email),
    onSuccess: () => {
      toast.success('Test email sent successfully');
      setTestingEmail('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to send test email');
    },
  });

  const triggerManualMutation = useMutation({
    mutationFn: (hours: number) => 
      emailNotificationAPI.triggerManual(currentWorkspace!.id, hours),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['email-logs'] });
      toast.success(`Manual notification sent - ${data.message_count} messages included`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to trigger manual notification');
    },
  });

  const handleEditConfig = (config: any) => {
    setEditingConfig(config);
    setShowConfigModal(true);
  };

  const handleDeleteConfig = (config: any) => {
    if (window.confirm(`Delete email configuration for ${config.email_address}?`)) {
      deleteConfigMutation.mutate(config.id);
    }
  };

  const handleTestEmail = () => {
    if (!testingEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testingEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }
    
    testEmailMutation.mutate({ email: testingEmail });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'inactive':
        return <XCircle className="w-4 h-4 text-gray-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const isAdmin = isCurrentUserAdmin;

  // Show no workspace state
  if (!currentWorkspace) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Workspace Selected</h3>
            <p className="text-gray-600">Please select a workspace to configure email notifications</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Notifications</h1>
          <p className="text-gray-600">Workspace: {currentWorkspace.name}</p>
          <p className="text-sm text-gray-500 mt-1">
            Automated chat data reports sent via email every 5 minutes
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowStatsModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Statistics
            </button>
            <button
              onClick={() => {
                setEditingConfig(null);
                setShowConfigModal(true);
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Configure Email
            </button>
          </div>
        )}
      </div>

      {!isAdmin && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-yellow-600" />
            <div>
              <h3 className="text-lg font-medium text-yellow-900 mb-2">Administrator Access Required</h3>
              <p className="text-yellow-800 mb-4">
                Only workspace administrators can configure email notifications.
              </p>
              <div className="text-sm text-yellow-700">
                <p><strong>Current Role:</strong> {isAdmin ? 'Administrator' : 'Member'}</p>
                <p><strong>Required Role:</strong> Administrator</p>
                <p className="mt-2">Contact your workspace administrator to request access.</p>
                {user?.is_admin && (
                  <div className="mt-4">
                    <button
                      onClick={async () => {
                        try {
                          await workspaceAPI.makeAdminOfAllWorkspaces();
                          toast.success('You are now admin of all workspaces!');
                          window.location.reload();
                        } catch (error: any) {
                          console.error('Error making admin:', error);
                          const errorMessage = error.response?.data?.detail || 'Error making you admin';
                          toast.error(errorMessage);
                        }
                      }}
                      className="mt-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      Make Me Admin of All Workspaces
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Status */}
      {systemStatus && (
        <div className={`rounded-lg p-4 mb-6 ${
          systemStatus.system_status === 'healthy' 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center gap-3">
            {systemStatus.system_status === 'healthy' ? (
              <CheckCircle className="w-6 h-6 text-green-600" />
            ) : (
              <AlertCircle className="w-6 h-6 text-red-600" />
            )}
            <div>
              <h3 className={`font-medium ${
                systemStatus.system_status === 'healthy' ? 'text-green-900' : 'text-red-900'
              }`}>
                Email System Status: {systemStatus.system_status === 'healthy' ? 'Healthy' : 'Configuration Incomplete'}
              </h3>
              <div className={`text-sm ${
                systemStatus.system_status === 'healthy' ? 'text-green-800' : 'text-red-800'
              }`}>
                <p>Active Configurations: {systemStatus.active_configurations}/{systemStatus.total_configurations}</p>
                <p>SMTP Configured: {systemStatus.smtp_configured ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current Configuration */}
      <div className="bg-white rounded-lg shadow-sm border mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-blue-500" />
              Email Configuration
            </h2>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading configurations...</p>
            </div>
          ) : emailConfigs?.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Email Configuration</h3>
              <p className="text-gray-600 mb-4">
                Configure an email address to receive automated chat reports
              </p>
              {isAdmin && (
                <button
                  onClick={() => setShowConfigModal(true)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-4 h-4" />
                  Configure Email
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {emailConfigs?.map((config: any) => (
                <div key={config.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Mail className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{config.email_address}</h3>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(config.status)}
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(config.status)}`}>
                              {config.status}
                            </span>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Frequency: Every {config.send_frequency_minutes} minutes</p>
                          <p>
                            Includes: {config.include_ai_messages ? 'AI' : ''} 
                            {config.include_ai_messages && config.include_human_messages ? ' & ' : ''}
                            {config.include_human_messages ? 'Human' : ''} messages
                          </p>
                          {config.last_email_sent && (
                            <p>Last sent: {formatTime(config.last_email_sent)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditConfig(config)}
                          className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit configuration"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteConfig(config)}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete configuration"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {config.last_error && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-medium text-red-900">Last Error:</span>
                      </div>
                      <p className="text-sm text-red-800 mt-1">{config.last_error}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Test Email Section */}
      {isAdmin && (
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <TestTube className="w-5 h-5 text-purple-500" />
              Test Email Configuration
            </h2>
            
            <div className="flex gap-3">
              <input
                type="email"
                value={testingEmail}
                onChange={(e) => setTestingEmail(e.target.value)}
                placeholder="Enter email address to test..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handleTestEmail}
                disabled={testEmailMutation.isPending || !testingEmail.trim()}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:bg-gray-400"
              >
                <Send className="w-4 h-4" />
                {testEmailMutation.isPending ? 'Sending...' : 'Send Test'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Send a test email to verify SMTP configuration and email delivery
            </p>
          </div>
        </div>
      )}

      {/* Manual Trigger Section */}
      {isAdmin && emailConfigs?.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border mb-6">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-orange-500" />
              Manual Report Generation
            </h2>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => triggerManualMutation.mutate(1)}
                disabled={triggerManualMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:bg-gray-400"
              >
                <Send className="w-4 h-4" />
                {triggerManualMutation.isPending ? 'Generating...' : 'Send Last 1 Hour'}
              </button>
              
              <button
                onClick={() => triggerManualMutation.mutate(6)}
                disabled={triggerManualMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:bg-gray-400"
              >
                <Send className="w-4 h-4" />
                {triggerManualMutation.isPending ? 'Generating...' : 'Send Last 6 Hours'}
              </button>
              
              <button
                onClick={() => triggerManualMutation.mutate(24)}
                disabled={triggerManualMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:bg-gray-400"
              >
                <Send className="w-4 h-4" />
                {triggerManualMutation.isPending ? 'Generating...' : 'Send Last 24 Hours'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Manually generate and send chat reports for specific time periods
            </p>
          </div>
        </div>
      )}

      {/* Recent Email Logs */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-green-500" />
            Recent Email Activity
          </h2>

          {emailLogs?.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Email Activity</h3>
              <p className="text-gray-600">
                Email notifications will appear here once configured and active
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Recipient
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Messages
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Sent At
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      File
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {emailLogs?.map((log: any) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {log.recipient_email}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {log.message_count} messages
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {log.status === 'sent' ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500" />
                          )}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            log.status === 'sent' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {log.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatTime(log.sent_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {log.file_path || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* How It Works */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Mail className="w-5 h-5" />
          How Email Notifications Work
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-blue-800">
          <div>
            <h4 className="font-medium mb-2">Automated Process:</h4>
            <ul className="text-sm space-y-1">
              <li>• System checks for new chat messages every 5 minutes</li>
              <li>• Excel reports are generated with professional formatting</li>
              <li>• Emails are sent only when new messages exist</li>
              <li>• Timestamps are converted to IST timezone</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Excel Report Contents:</h4>
            <ul className="text-sm space-y-1">
              <li>• Sender and receiver phone numbers</li>
              <li>• Message direction (Incoming/Outgoing)</li>
              <li>• Message source (AI Generated/Human)</li>
              <li>• Complete message content and timestamps</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modals */}
      <EmailConfigModal
        isOpen={showConfigModal}
        onClose={() => {
          setShowConfigModal(false);
          setEditingConfig(null);
        }}
        workspaceId={currentWorkspace.id}
        editingConfig={editingConfig}
      />

      <EmailStatsModal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        workspaceId={currentWorkspace.id}
      />
    </div>
  );
};