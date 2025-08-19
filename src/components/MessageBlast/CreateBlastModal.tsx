import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  X, Upload, Megaphone, Phone, Clock, Users, 
  FileSpreadsheet, AlertCircle, Calendar, MessageSquare 
} from 'lucide-react';
import { messageBlastAPI } from '../../lib/api';
import toast from 'react-hot-toast';

const schema = yup.object({
  title: yup.string().required('Title is required').min(3, 'Title must be at least 3 characters'),
  message_content: yup.string().required('Message content is required').min(10, 'Message must be at least 10 characters'),
  sender_phone_id: yup.string().required('Sender phone is required'),
  batch_size: yup.number().min(1, 'Batch size must be at least 1').max(50, 'Batch size cannot exceed 50').required(),
  batch_interval_minutes: yup.number().min(1, 'Interval must be at least 1 minute').max(30, 'Interval cannot exceed 30 minutes').required(),
  start_time: yup.string().required('Start time is required'),
  end_time: yup.string().optional(),
});

type FormData = yup.InferType<typeof schema>;

interface CreateBlastModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  connectedPhones: any[];
}

export const CreateBlastModal: React.FC<CreateBlastModalProps> = ({ 
  isOpen, 
  onClose, 
  workspaceId,
  connectedPhones 
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [phonePreview, setPhonePreview] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  
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
      batch_size: 5,
      batch_interval_minutes: 2,
    },
  });

  const messageContent = watch('message_content');

  const createBlastMutation = useMutation({
    mutationFn: (formData: FormData) => messageBlastAPI.createBlast(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-blasts'] });
      toast.success('Message blast created successfully');
      handleClose();
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.detail || 'Failed to create message blast';
      toast.error(errorMessage);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      toast.error('Please select an Excel file (.xlsx or .xls)');
      return;
    }

    setSelectedFile(file);
    setPhonePreview(null);

    // Preview phone numbers
    setIsPreviewLoading(true);
    try {
      const formData = new FormData();
      formData.append('workspace_id', workspaceId);
      formData.append('file', file);

      const preview = await messageBlastAPI.previewPhoneNumbers(formData);
      setPhonePreview(preview);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to preview phone numbers');
      setSelectedFile(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const onSubmit = (data: FormData) => {
    if (!selectedFile) {
      toast.error('Please select an Excel file with phone numbers');
      return;
    }

    if (!phonePreview || phonePreview.total_numbers === 0) {
      toast.error('No valid phone numbers found in the file');
      return;
    }

    const formData = new FormData();
    formData.append('workspace_id', workspaceId);
    formData.append('title', data.title);
    formData.append('message_content', data.message_content);
    formData.append('sender_phone_id', data.sender_phone_id);
    formData.append('batch_size', data.batch_size.toString());
    formData.append('batch_interval_minutes', data.batch_interval_minutes.toString());
    formData.append('start_time', data.start_time);
    if (data.end_time) {
      formData.append('end_time', data.end_time);
    }
    formData.append('file', selectedFile);

    createBlastMutation.mutate(formData);
  };

  const handleClose = () => {
    reset();
    setSelectedFile(null);
    setPhonePreview(null);
    onClose();
  };

  // Get current datetime for min values
  const now = new Date();
  const minDateTime = new Date(now.getTime() + 5 * 60000).toISOString().slice(0, 16); // 5 minutes from now

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Create Message Blast</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Blast Title *
              </label>
              <input
                {...register('title')}
                type="text"
                placeholder="e.g., Product Launch Announcement"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sender Phone Number *
              </label>
              <select
                {...register('sender_phone_id')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select sender phone</option>
                {connectedPhones.map((phone: any) => (
                  <option key={phone.id} value={phone.id}>
                    {phone.phone_number} {phone.display_name && `(${phone.display_name})`}
                  </option>
                ))}
              </select>
              {errors.sender_phone_id && (
                <p className="mt-1 text-sm text-red-600">{errors.sender_phone_id.message}</p>
              )}
            </div>
          </div>

          {/* Message Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message Content *
            </label>
            <textarea
              {...register('message_content')}
              rows={4}
              placeholder="Enter your broadcast message here..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {errors.message_content && (
              <p className="mt-1 text-sm text-red-600">{errors.message_content.message}</p>
            )}
            <div className="flex justify-between mt-1">
              <p className="text-xs text-gray-500">
                Keep messages concise for better engagement
              </p>
              <p className="text-xs text-gray-500">
                {messageContent?.length || 0} characters
              </p>
            </div>
          </div>

          {/* Phone Numbers Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Numbers (Excel File) *
            </label>
            
            {!selectedFile ? (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-green-400 transition-colors">
                <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900 mb-2">
                  Upload Excel file with phone numbers
                </p>
                <p className="text-sm text-gray-600 mb-4">
                  Supports .xlsx and .xls files (max 1000 numbers)
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="phone-file-upload"
                />
                <label
                  htmlFor="phone-file-upload"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer inline-flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Choose Excel File
                </label>
              </div>
            ) : (
              <div className="border border-gray-300 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="w-8 h-8 text-green-600" />
                    <div>
                      <p className="font-medium text-gray-900">{selectedFile.name}</p>
                      <p className="text-sm text-gray-600">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPhonePreview(null);
                    }}
                    className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {isPreviewLoading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto"></div>
                    <p className="mt-2 text-sm text-gray-600">Processing phone numbers...</p>
                  </div>
                ) : phonePreview && (
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">
                        {phonePreview.total_numbers} valid phone numbers found
                      </span>
                    </div>
                    {phonePreview.preview.length > 0 && (
                      <div>
                        <p className="text-xs text-green-700 mb-1">Preview (first 10):</p>
                        <div className="text-xs text-green-600 font-mono">
                          {phonePreview.preview.slice(0, 5).join(', ')}
                          {phonePreview.preview.length > 5 && '...'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scheduling */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Time *
              </label>
              <input
                {...register('start_time')}
                type="datetime-local"
                min={minDateTime}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {errors.start_time && (
                <p className="mt-1 text-sm text-red-600">{errors.start_time.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Time (Optional)
              </label>
              <input
                {...register('end_time')}
                type="datetime-local"
                min={minDateTime}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {errors.end_time && (
                <p className="mt-1 text-sm text-red-600">{errors.end_time.message}</p>
              )}
            </div>
          </div>

          {/* Batch Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Batch Size *
              </label>
              <input
                {...register('batch_size')}
                type="number"
                min="1"
                max="50"
                placeholder="5"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {errors.batch_size && (
                <p className="mt-1 text-sm text-red-600">{errors.batch_size.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Number of messages to send at once
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interval Between Batches (minutes) *
              </label>
              <input
                {...register('batch_interval_minutes')}
                type="number"
                min="1"
                max="30"
                placeholder="2"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {errors.batch_interval_minutes && (
                <p className="mt-1 text-sm text-red-600">{errors.batch_interval_minutes.message}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Wait time between sending batches
              </p>
            </div>
          </div>

          {/* Excel Format Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-blue-900 mb-1">Excel File Format</h4>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>• Include phone numbers in any column (with headers like "Phone", "Mobile", "Number")</li>
                  <li>• Use international format with country code (e.g., +1234567890)</li>
                  <li>• Maximum 1000 phone numbers per blast</li>
                  <li>• Duplicate numbers will be automatically removed</li>
                  <li>• Invalid numbers will be filtered out</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Blast Preview */}
          {phonePreview && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Blast Preview</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Target Numbers:</span>
                  <span className="ml-2 font-medium">{phonePreview.total_numbers}</span>
                </div>
                <div>
                  <span className="text-gray-600">Estimated Duration:</span>
                  <span className="ml-2 font-medium">
                    {Math.ceil(phonePreview.total_numbers / (watch('batch_size') || 5)) * (watch('batch_interval_minutes') || 2)} minutes
                  </span>
                </div>
              </div>
            </div>
          )}

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
              disabled={createBlastMutation.isPending || !selectedFile || !phonePreview}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:bg-gray-400 flex items-center gap-2"
            >
              <Megaphone className="w-4 h-4" />
              {createBlastMutation.isPending ? 'Creating...' : 'Create Blast'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};