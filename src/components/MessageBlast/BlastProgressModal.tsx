import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  X, BarChart3, Users, Clock, CheckCircle, XCircle, 
  AlertCircle, TrendingUp, Calendar, Phone 
} from 'lucide-react';
import { messageBlastAPI } from '../../lib/api';
import { formatTime } from '../../lib/utils';

interface BlastProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  blast: any;
}

export const BlastProgressModal: React.FC<BlastProgressModalProps> = ({ 
  isOpen, 
  onClose, 
  blast 
}) => {
  const { data: progress, isLoading } = useQuery({
    queryKey: ['blast-progress', blast?.id],
    queryFn: () => messageBlastAPI.getBlastProgress(blast!.id),
    enabled: isOpen && !!blast?.id,
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  if (!isOpen || !blast) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Blast Progress</h2>
              <p className="text-sm text-gray-600">{blast.title}</p>
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
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading progress...</p>
            </div>
          ) : progress ? (
            <div className="space-y-6">
              {/* Overall Progress */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-medium text-gray-900">Overall Progress</h3>
                  <span className="text-2xl font-bold text-blue-600">
                    {progress.progress_percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${progress.progress_percentage}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm text-gray-600 mt-2">
                  <span>0</span>
                  <span>{progress.total_targets} targets</span>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Users className="w-6 h-6 text-gray-600" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{progress.total_targets}</p>
                  <p className="text-xs text-gray-600">Total Targets</p>
                </div>

                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-2">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-2xl font-bold text-green-900">{progress.sent_count}</p>
                  <p className="text-xs text-green-600">Sent</p>
                </div>

                <div className="bg-red-50 p-4 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-2">
                    <XCircle className="w-6 h-6 text-red-600" />
                  </div>
                  <p className="text-2xl font-bold text-red-900">{progress.failed_count}</p>
                  <p className="text-xs text-red-600">Failed</p>
                </div>

                <div className="bg-yellow-50 p-4 rounded-lg text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Clock className="w-6 h-6 text-yellow-600" />
                  </div>
                  <p className="text-2xl font-bold text-yellow-900">{progress.pending_count}</p>
                  <p className="text-xs text-yellow-600">Pending</p>
                </div>
              </div>

              {/* Batch Progress */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">Batch Progress</h3>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Current Batch:</span>
                    <span className="font-medium">{progress.current_batch} of {progress.total_batches}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current_batch / progress.total_batches) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Timing Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {progress.last_sent_at && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">Last Message Sent</span>
                    </div>
                    <p className="text-sm text-blue-800">{formatTime(progress.last_sent_at)}</p>
                  </div>
                )}

                {progress.estimated_completion && (
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-900">Estimated Completion</span>
                    </div>
                    <p className="text-sm text-purple-800">{formatTime(progress.estimated_completion)}</p>
                  </div>
                )}
              </div>

              {/* Real-time Status */}
              {blast.status === 'active' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-green-900">Blast is currently active</span>
                  </div>
                  <p className="text-xs text-green-800">
                    Messages are being sent automatically according to your batch settings.
                    Progress updates every few seconds.
                  </p>
                </div>
              )}

              {blast.status === 'paused' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Pause className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-900">Blast is paused</span>
                  </div>
                  <p className="text-xs text-yellow-800">
                    Message sending has been temporarily paused. Resume to continue.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Progress Data</h3>
              <p className="text-gray-600">Unable to load progress information</p>
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