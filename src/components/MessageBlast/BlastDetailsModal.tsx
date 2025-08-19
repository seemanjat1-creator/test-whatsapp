import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  X, Megaphone, Phone, Users, Calendar, Clock, 
  MessageSquare, BarChart3, CheckCircle, XCircle, 
  AlertCircle, Play, Pause 
} from 'lucide-react';
import { messageBlastAPI } from '../../lib/api';
import { formatDate, formatTime } from '../../lib/utils';

interface BlastDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  blast: any;
}

export const BlastDetailsModal: React.FC<BlastDetailsModalProps> = ({ 
  isOpen, 
  onClose, 
  blast 
}) => {
  const { data: targets } = useQuery({
    queryKey: ['blast-targets', blast?.id],
    queryFn: () => messageBlastAPI.getBlastTargets(blast!.id),
    enabled: isOpen && !!blast?.id,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-blue-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'delivered':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isOpen || !blast) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{blast.title}</h2>
              <p className="text-sm text-gray-600">Blast Details & Progress</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Blast Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Blast Information</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(blast.status)}`}>
                      {blast.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Target Count:</span>
                    <span className="text-sm font-medium">{blast.target_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Batch Size:</span>
                    <span className="text-sm font-medium">{blast.batch_size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Batch Interval:</span>
                    <span className="text-sm font-medium">{blast.batch_interval_minutes} minutes</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Timing</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Created:</span>
                    <span className="text-sm font-medium">{formatDate(blast.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Start Time:</span>
                    <span className="text-sm font-medium">{formatTime(blast.start_time)}</span>
                  </div>
                  {blast.end_time && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">End Time:</span>
                      <span className="text-sm font-medium">{formatTime(blast.end_time)}</span>
                    </div>
                  )}
                  {blast.completed_at && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Completed:</span>
                      <span className="text-sm font-medium">{formatTime(blast.completed_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Progress Statistics</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Sent:</span>
                    <span className="text-sm font-medium text-green-600">{blast.sent_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Failed:</span>
                    <span className="text-sm font-medium text-red-600">{blast.failed_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Delivered:</span>
                    <span className="text-sm font-medium text-blue-600">{blast.delivered_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Pending:</span>
                    <span className="text-sm font-medium text-gray-600">
                      {blast.target_count - blast.sent_count - blast.failed_count}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Overall Progress</h3>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${((blast.sent_count + blast.failed_count) / blast.target_count) * 100}%` 
                    }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {Math.round(((blast.sent_count + blast.failed_count) / blast.target_count) * 100)}% complete
                </p>
              </div>
            </div>
          </div>

          {/* Message Content */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Message Content</h3>
            <div className="bg-gray-50 border rounded-lg p-4">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{blast.message_content}</p>
            </div>
          </div>

          {/* Target Numbers Table */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Target Numbers</h3>
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Phone Number
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Sent At
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Batch
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {targets?.map((target: any) => (
                      <tr key={target.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-sm">{target.phone_number}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(target.status)}
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(target.status)}`}>
                              {target.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {target.sent_at ? formatTime(target.sent_at) : '-'}
                        </td>
                        <td className="px-4 py-2 text-gray-600">
                          {target.batch_number}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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