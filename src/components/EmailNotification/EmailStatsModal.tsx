import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  X, BarChart3, Mail, TrendingUp, Calendar, 
  CheckCircle, XCircle, Clock, FileSpreadsheet 
} from 'lucide-react';
import { emailNotificationAPI } from '../../lib/api';

interface EmailStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export const EmailStatsModal: React.FC<EmailStatsModalProps> = ({ 
  isOpen, 
  onClose, 
  workspaceId 
}) => {
  const { data: statistics, isLoading } = useQuery({
    queryKey: ['email-statistics', workspaceId],
    queryFn: () => emailNotificationAPI.getStatistics(workspaceId, 30),
    enabled: isOpen && !!workspaceId,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Email Notification Statistics</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading statistics...</p>
            </div>
          ) : statistics?.statistics ? (
            <div className="space-y-6">
              {/* Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-600">Total Emails</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {statistics.statistics.total_emails_sent}
                      </p>
                    </div>
                    <Mail className="w-8 h-8 text-blue-600" />
                  </div>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-600">Successful</p>
                      <p className="text-2xl font-bold text-green-900">
                        {statistics.statistics.successful_emails}
                      </p>
                    </div>
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                </div>

                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-purple-600">Messages Sent</p>
                      <p className="text-2xl font-bold text-purple-900">
                        {statistics.statistics.total_messages_notified}
                      </p>
                    </div>
                    <FileSpreadsheet className="w-8 h-8 text-purple-600" />
                  </div>
                </div>

                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-orange-600">Success Rate</p>
                      <p className="text-2xl font-bold text-orange-900">
                        {statistics.statistics.success_rate.toFixed(1)}%
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-orange-600" />
                  </div>
                </div>
              </div>

              {/* Daily Breakdown */}
              {statistics.statistics.daily_breakdown && Object.keys(statistics.statistics.daily_breakdown).length > 0 && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Daily Activity (Last 30 Days)
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-white border-b">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-700">Date</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-700">Emails Sent</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-700">Messages Included</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {Object.entries(statistics.statistics.daily_breakdown)
                            .sort(([a], [b]) => b.localeCompare(a))
                            .slice(0, 10)
                            .map(([date, data]: [string, any]) => (
                            <tr key={date} className="hover:bg-white">
                              <td className="px-4 py-2 font-medium text-gray-900">{date}</td>
                              <td className="px-4 py-2 text-gray-600">{data.emails}</td>
                              <td className="px-4 py-2 text-gray-600">{data.messages}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* System Information */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">System Information</h4>
                <div className="text-xs text-blue-800 space-y-1">
                  <p>• Statistics cover the last 30 days of email activity</p>
                  <p>• Emails are sent automatically every 5 minutes when new messages exist</p>
                  <p>• Excel reports include all chat data with professional formatting</p>
                  <p>• Timestamps are converted to IST (Asia/Kolkata) timezone</p>
                  <p>• Only workspaces with active email configurations receive notifications</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Statistics Available</h3>
              <p className="text-gray-600">
                Statistics will appear here once email notifications are configured and active
              </p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};