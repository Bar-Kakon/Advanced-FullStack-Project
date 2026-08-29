import { useAuthedImage } from '../useAuthedImage';

/** The stored picture when there is one, and the person's initials when there is not. */
export const ProfileAvatar = ({
  avatarUrl,
  initials,
  large = false,
}: {
  avatarUrl: string | null;
  initials: string;
  large?: boolean;
}) => {
  const source = useAuthedImage(avatarUrl);
  const className = `avatar${large ? ' avatar--lg' : ''}`;

  if (source === null) {
    return <span className={className} aria-hidden="true">{initials}</span>;
  }

  return <img className={`${className} avatar--image`} src={source} alt="" />;
};
