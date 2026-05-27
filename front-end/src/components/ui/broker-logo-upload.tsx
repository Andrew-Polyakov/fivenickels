import * as React from 'react';
import { UploadIcon } from 'lucide-react';

import { Button } from './button';
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadItemProgress,
  FileUploadList,
} from './file-upload';
import { cn } from '../../lib/utils';

type BrokerLogoUploadProps = {
  label: string;
  currentUrl?: string;
  disabled?: boolean;
  invalid?: boolean;
  error?: string;
  onUpload: (file: File) => Promise<void>;
};

export function BrokerLogoUpload({
  label,
  currentUrl,
  disabled,
  invalid,
  error,
  onUpload,
}: BrokerLogoUploadProps) {
  const [files, setFiles] = React.useState<File[]>([]);

  return (
    <div
      className={cn(
        'scn-broker-logo-upload',
        invalid && 'scn-broker-logo-upload--invalid',
      )}
    >
      <FileUpload
        accept="image/*"
        maxFiles={1}
        multiple={false}
        disabled={disabled}
        invalid={invalid}
        value={files}
        onValueChange={setFiles}
        label="Upload broker logo"
        className="scn-broker-logo-upload__root"
        onFileValidate={(file) => {
          if (!file.type.startsWith('image/')) {
            return 'Please select an image file.';
          }
          return null;
        }}
        onUpload={async (uploadFiles, { onProgress, onSuccess, onError }) => {
          const file = uploadFiles[0];
          if (!file) return;
          try {
            onProgress(file, 15);
            await onUpload(file);
            onProgress(file, 100);
            onSuccess(file);
            setFiles([]);
          } catch (err) {
            onError(file, err instanceof Error ? err : new Error('Upload failed'));
          }
        }}
      >
        <FileUploadDropzone className="scn-broker-logo-upload__dropzone">
          {currentUrl ? (
            <img src={currentUrl} alt="" className="scn-broker-edit__logo-preview" />
          ) : (
            <p className="scn-broker-edit__logo-placeholder">{label}</p>
          )}
          <p className="scn-broker-logo-upload__hint">
            <UploadIcon aria-hidden />
            Drag and drop an image, or click to browse
          </p>
        </FileUploadDropzone>
        <FileUploadList className="scn-broker-logo-upload__list">
          {files.map((file) => (
            <FileUploadItem key={`${file.name}-${file.size}`} value={file}>
              <FileUploadItemPreview />
              <FileUploadItemMetadata />
              <FileUploadItemProgress />
              <FileUploadItemDelete asChild>
                <Button type="button" variant="ghost" className="scn-broker-logo-upload__remove">
                  Remove
                </Button>
              </FileUploadItemDelete>
            </FileUploadItem>
          ))}
        </FileUploadList>
      </FileUpload>
      {error && (
        <p className="scn-broker-edit__field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
