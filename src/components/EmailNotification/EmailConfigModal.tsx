import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Mail, Save, Clock, Settings } from 'lucide-react';
import { emailNotificationAPI } from '../../lib/api';
import toast from 'react-hot-toast';

const schema = yup.object({
  email_address: yup
    .string()
    .email('Please enter a valid email address')
    .required('Email address is required'),
  send_frequency_minutes: yup
    .number()
    .min(1, 'Frequency must be at least 1 minute')
    .max(60, 'Frequency cannot exceed 60 minutes')
    .required('Send frequency is required'),
  include_ai_messages: yup.boolean(),
  include_human_messages: yup.boolean(),
  status: yup.string().required(),
});

type FormData = yup.InferType<typeof schema>;

interface EmailConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  editingConfig?: any;
}

export const EmailConfigModal: React.FC<EmailConfigModalProps> = ({ 
  isOpen, 
  onClose, 
  workspaceId,
  editingConfig 
}) => {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      send_frequency_minutes: 5,
      include_ai_messages: true,
      include_human_messages: true,
      status: 'active',
    },
  });

  const includeAI = watch('include_ai_messages');
  const includeHuman = watch('include_human_messages');

  // Reset form when editing config changes
  useEffect(() => {
    if (editingConfig) {
      reset({
        email_address: editingConfig.email_address,
        send_frequency_minutes: editingConfig.send_frequency_minutes,
        include_ai_messages: editingConfig.include_ai_messages,
        include_human_messages: editingConfig.include_human_messages,
        status: editingConfig.status,
      });
    } else {
      reset({
        send_frequency_minutes: 5,
        include_ai_messages: true,
        include_human_messages: true,
        status: 'active',
      });
    }
  }, [editingConfig, reset]);

  const createMutation = useMutation({
    mutationFn: (data: any) => emailNotificationAPI.createConfig({
      ...data,
      workspace_id: workspaceId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-configs'] });
      toast.success('Email configuration created successfully');
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create configuration');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => emailNotificationAPI.updateConfig(editingConfig.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-configs'] });
      toast.success('Email configuration updated successfully');
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update configuration');
    },
  });

  const onSubmit = (data: FormData) => {
    // Validate that at least one message type is included
    if (!data.include_ai_messages && !data.include_human_messages) {
      toast.error('At least one message type must be included');
      return;
    }

    if (editingConfig) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
              <Mail className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {editingConfig ? 'Edit Email Configuration' : 'Configure Email Notifications'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Email Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address *
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-gray-400" />
              </div>
              <input
                {...register('email_address')}
                type="email"
                placeholder="notifications@company.com"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            {errors.email_address && (
              <p className="mt-1 text-sm text-red-600">{errors.email_address.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Email address to receive automated chat reports
            </p>
          </div>

          {/* Configuration Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Send Frequency (minutes) *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Clock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  {...register('send_frequency_minutes')}
                  type="number"
                  min="1"
                  max="60"
                  placeholder="5"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              {errors.send_frequency_minutes && (
                <p className="mt-1 text-sm text-red-600">{errors.send_frequency_minutes.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                How often to check for new messages (1-60 minutes)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status *
              </label>
              <select
                {...register('status')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Enable or disable email notifications
              </p>
            </div>
          </div>

          {/* Message Type Filters */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Include Message Types *
            </label>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  {...register('include_ai_messages')}
                  type="checkbox"
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="ml-3 text-sm text-gray-700">
                  AI Generated Messages
                </span>
              </label>

              <label className="flex items-center">
                <input
                  {...register('include_human_messages')}
                  type="checkbox"
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="ml-3 text-sm text-gray-700">
                  Human Sent Messages
                </span>
              </label>
            </div>
            
            {!includeAI && !includeHuman && (
              <p className="mt-2 text-sm text-red-600">
                At least one message type must be selected
              </p>
            )}
          </div>

          {/* Email Format Preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Email Report Format
            </h4>
            <div className="text-xs text-gray-600 space-y-1">
              <p>• <strong>Subject:</strong> WhatsApp Chat Report - [Workspace] - [Date Time IST]</p>
              <p>• <strong>Attachment:</strong> [WorkspaceName]_ChatData_YYYY-MM-DD_HH-MM.xlsx</p>
              <p>• <strong>Columns:</strong> Sender Phone, Receiver Phone, Direction, Source, Content, Timestamp (IST)</p>
              <p>• <strong>Frequency:</strong> Only sent when new messages exist since last email</p>
              <p>• <strong>Timezone:</strong> All timestamps converted to IST (Asia/Kolkata)</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending || (!includeAI && !includeHuman)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:bg-gray-400 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {(createMutation.isPending || updateMutation.isPending) 
                ? 'Saving...' 
                : editingConfig 
                ? 'Update Configuration' 
                : 'Create Configuration'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};