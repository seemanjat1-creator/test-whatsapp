import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messageBlastAPI, phoneAPI } from '../../lib/api';
import { 
  Plus, Megaphone, Play, Pause, Square, Trash2, Edit3, 
  Clock, CheckCircle, XCircle, AlertCircle, Users, 
  Calendar, Phone, MessageSquare, BarChart3, Shield
} from 'lucide-react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import { workspaceAPI } from '../../lib/api';
import { CreateBlastModal } from './CreateBlastModal';
import { BlastDetailsModal } from './BlastDetailsModal';
import { BlastProgressModal } from './BlastProgressModal';
import { formatDate, formatTime } from '../../lib/utils';
import toast from 'react-hot-toast';

export const MessageBlastPage: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [selectedBlast, setSelectedBlast] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState('all');
  
  const queryClient = useQueryClient();
  const { currentWorkspace, isCurrentUserAdmin } = useWorkspace();
  const { user } = useAuth();

  const { data: blasts, isLoading } = useQuery({
    queryKey: ['message-blasts', currentWorkspace?.id],
    queryFn: () => messageBlastAPI.getWorkspaceBlasts(currentWorkspace!.id),
    enabled: !!currentWorkspace?.id,
    refetchInterval: 5000, // Refresh every 5 seconds for active blasts
  });

  const { data: phones } = useQuery({
    queryKey: ['phones', currentWorkspace?.id],
    queryFn: () => phoneAPI.getWorkspacePhones(currentWorkspace!.id),
    enabled: !!currentWorkspace?.id,
  });

  const { data: statistics } = useQuery({
    queryKey: ['blast-statistics', currentWorkspace?.id],
    queryFn: () => messageBlastAPI.getBlastStatistics(currentWorkspace!.id, 30),
    enabled: !!currentWorkspace?.id,
  });

  const startBlastMutation = useMutation({
    mutationFn: (blastId: string) => messageBlastAPI.startBlast(blastId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-blasts'] });
      toast.success('Message blast started');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to start blast');
    },
  });

  const pauseBlastMutation = useMutation({
    mutationFn: (blastId: string) => messageBlastAPI.pauseBlast(blastId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-blasts'] });
      toast.success('Message blast paused');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to pause blast');
    },
  });

  const resumeBlastMutation = useMutation({
    mutationFn: (blastId: string) => messageBlastAPI.resumeBlast(blastId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-blasts'] });
      toast.success('Message blast resumed');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to resume blast');
    },
  });

  const cancelBlastMutation = useMutation({
    mutationFn: (blastId: string) => messageBlastAPI.cancelBlast(blastId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-blasts'] });
      toast.success('Message blast cancelled');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to cancel blast');
    },
  });

  const deleteBlastMutation = useMutation({
    mutationFn: (blastId: string) => messageBlastAPI.deleteBlast(blastId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-blasts'] });
      toast.success('Message blast deleted');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete blast');
    },
  });

  const handleStartBlast = (blast: any) => {
    if (window.confirm(`Start message blast "${blast.title}"? This will begin sending messages immediately.`)) {
      startBlastMutation.mutate(blast.id);
    }
  };

  const handlePauseBlast = (blast: any) => {
    pauseBlastMutation.mutate(blast.id);
  };

  const handleResumeBlast = (blast: any) => {
    resumeBlastMutation.mutate(blast.id);
  };

  const handleCancelBlast = (blast: any) => {
    if (window.confirm(`Cancel message blast "${blast.title}"? This action cannot be undone.`)) {
      cancelBlastMutation.mutate(blast.id);
    }
  };

  const handleDeleteBlast = (blast: any) => {
    if (window.confirm(`Delete message blast "${blast.title}"? This action cannot be undone.`)) {
      deleteBlastMutation.mutate(blast.id);
    }
  };

  const handleViewDetails = (blast: any) => {
    setSelectedBlast(blast);
    setShowDetailsModal(true);
  };

  const handleViewProgress = (blast: any) => {
    setSelectedBlast(blast);
    setShowProgressModal(true);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'active':
        return <Play className="w-5 h-5 text-blue-500" />;
      case 'paused':
        return <Pause className="w-5 h-5 text-yellow-500" />;
      case 'scheduled':
        return <Clock className="w-5 h-5 text-purple-500" />;
      case 'cancelled':
        return <Square className="w-5 h-5 text-gray-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'active':
        return 'bg-blue-100 text-blue-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'scheduled':
        return 'bg-purple-100 text-purple-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredBlasts = blasts?.filter((blast: any) => 
    filterStatus === 'all' || blast.status === filterStatus
  ) || [];

  const isAdmin = isCurrentUserAdmin;
  const connectedPhones = phones?.filter((p: any) => p.status === 'connected') || [];

  // Show no workspace state
  if (!currentWorkspace) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Megaphone className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Workspace Selected</h3>
            <p className="text-gray-600">Please select a workspace to manage message blasts</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Message Blasts</h1>
          <p className="text-gray-600">Workspace: {currentWorkspace.name}</p>
          <p className="text-sm text-gray-500 mt-1">
            Bulk broadcast messages to multiple WhatsApp numbers
          </p>
        </div>
        {isAdmin && connectedPhones.length > 0 && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Blast
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-yellow-600" />
            <div>
              <h3 className="text-lg font-medium text-yellow-900 mb-2">Administrator Access Required</h3>
              <p className="text-yellow-800 mb-4">
                Only workspace administrators can create and manage message blasts.
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

      {isAdmin && connectedPhones.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-3">
            <Phone className="w-8 h-8 text-blue-600" />
            <div>
              <h3 className="text-lg font-medium text-blue-900 mb-2">No Connected Phone Numbers</h3>
              <p className="text-blue-800 mb-4">
                You need at least one connected WhatsApp number to create message blasts.
              </p>
              <a
                href="/phones"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm inline-flex items-center gap-2"
              >
                <Phone className="w-4 h-4" />
                Manage Phone Numbers
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Blasts</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.statistics.total_blasts}</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-100">
                <Megaphone className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Blasts</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.statistics.active_blasts}</p>
              </div>
              <div className="p-3 rounded-lg bg-green-100">
                <Play className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Messages Sent</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.statistics.total_messages_sent}</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-100">
                <MessageSquare className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Success Rate</p>
                <p className="text-2xl font-bold text-gray-900">{statistics.statistics.success_rate}%</p>
              </div>
              <div className="p-3 rounded-lg bg-orange-100">
                <BarChart3 className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Filter by status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Message Blasts List */}
      <div className="bg-white rounded-lg shadow-sm border">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading message blasts...</p>
          </div>
        ) : filteredBlasts.length === 0 ? (
          <div className="text-center py-12">
            <Megaphone className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {blasts?.length === 0 ? 'No message blasts created' : 'No blasts match your filter'}
            </h3>
            <p className="text-gray-600 mb-4">
              {blasts?.length === 0 
                ? 'Create your first message blast to send bulk WhatsApp messages'
                : 'Try adjusting your status filter'
              }
            </p>
            {isAdmin && connectedPhones.length > 0 && blasts?.length === 0 && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                Create First Blast
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Blast Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Schedule
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBlasts.map((blast: any) => (
                  <tr key={blast.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Megaphone className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900">{blast.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {blast.message_content.length > 50 
                              ? `${blast.message_content.substring(0, 50)}...` 
                              : blast.message_content
                            }
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {blast.target_count} targets
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {formatDate(blast.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(blast.status)}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(blast.status)}`}>
                          {blast.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Sent:</span>
                          <span className="font-medium text-green-600">{blast.sent_count}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Failed:</span>
                          <span className="font-medium text-red-600">{blast.failed_count}</span>
                        </div>
                        {blast.status === 'active' && (
                          <button
                            onClick={() => handleViewProgress(blast)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            View Progress →
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="space-y-1">
                        <div>Start: {formatTime(blast.start_time)}</div>
                        {blast.end_time && (
                          <div>End: {formatTime(blast.end_time)}</div>
                        )}
                        <div className="text-xs text-gray-500">
                          Batch: {blast.batch_size} every {blast.batch_interval_minutes}m
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewDetails(blast)}
                          className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                          title="View details"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {isAdmin && (
                          <>
                            {blast.status === 'scheduled' && (
                              <button
                                onClick={() => handleStartBlast(blast)}
                                className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                                title="Start now"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}

                            {blast.status === 'active' && (
                              <button
                                onClick={() => handlePauseBlast(blast)}
                                className="p-2 text-gray-400 hover:text-yellow-600 transition-colors"
                                title="Pause blast"
                              >
                                <Pause className="w-4 h-4" />
                              </button>
                            )}

                            {blast.status === 'paused' && (
                              <button
                                onClick={() => handleResumeBlast(blast)}
                                className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                                title="Resume blast"
                              >
                                <Play className="w-4 h-4" />
                              </button>
                            )}

                            {(blast.status === 'active' || blast.status === 'scheduled' || blast.status === 'paused') && (
                              <button
                                onClick={() => handleCancelBlast(blast)}
                                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                                title="Cancel blast"
                              >
                                <Square className="w-4 h-4" />
                              </button>
                            )}

                            {(blast.status === 'draft' || blast.status === 'completed' || blast.status === 'cancelled' || blast.status === 'failed') && (
                              <button
                                onClick={() => handleDeleteBlast(blast)}
                                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                                title="Delete blast"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <Megaphone className="w-5 h-5" />
          How Message Blasts Work
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-blue-800">
          <div>
            <h4 className="font-medium mb-2">Setup Process:</h4>
            <ul className="text-sm space-y-1">
              <li>• Upload Excel file with phone numbers</li>
              <li>• Configure message content and timing</li>
              <li>• Set batch size and intervals</li>
              <li>• Choose connected WhatsApp number as sender</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Execution:</h4>
            <ul className="text-sm space-y-1">
              <li>• Messages sent in configurable batches</li>
              <li>• Automatic delays between batches</li>
              <li>• Real-time progress tracking</li>
              <li>• Pause/resume capability</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateBlastModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        workspaceId={currentWorkspace.id}
        connectedPhones={connectedPhones}
      />

      {selectedBlast && (
        <>
          <BlastDetailsModal
            isOpen={showDetailsModal}
            onClose={() => {
              setShowDetailsModal(false);
              setSelectedBlast(null);
            }}
            blast={selectedBlast}
          />

          <BlastProgressModal
            isOpen={showProgressModal}
            onClose={() => {
              setShowProgressModal(false);
              setSelectedBlast(null);
            }}
            blast={selectedBlast}
          />
        </>
      )}
    </div>
  );
};