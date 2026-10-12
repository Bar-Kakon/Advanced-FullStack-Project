import { api } from '../../../api/client';
import { attachmentPath } from '../../../api/messaging.api';
import type { MessageAttachment } from '../../../api/messaging.types';
import { useLanguage } from '../../../i18n/useLanguage';
import { useAuthedImage } from '../../profile/useAuthedImage';

export interface MessageAttachmentItemProps {
  readonly conversationId: string;
  readonly attachment: MessageAttachment;
}

/** Fetched through the guarded route as a blob, so the Bearer token travels with it. */
const download = async (conversationId: string, attachment: MessageAttachment): Promise<void> => {
  const { data } = await api.get<Blob>(attachmentPath(conversationId, attachment.id), {
    responseType: 'blob',
  });

  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = attachment.filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const MessageAttachmentItem = ({ conversationId, attachment }: MessageAttachmentItemProps) => {
  const { t } = useLanguage();
  const isImage = attachment.mimeType.startsWith('image/');
  const imageUrl = useAuthedImage(isImage ? attachmentPath(conversationId, attachment.id) : null);

  if (isImage) {
    return imageUrl === null ? null : (
      <img className="msg-attachment__image" src={imageUrl} alt={attachment.filename} />
    );
  }

  return (
    <span className="msg-attachment__file">
      <span className="msg-attachment__name" dir="ltr">{attachment.filename}</span>
      <button
        type="button"
        className="msg-bubble__report"
        onClick={() => void download(conversationId, attachment)}
      >
        {t.messaging.download}
      </button>
    </span>
  );
};
