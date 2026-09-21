export type IconName = 'chat' | 'together' | 'look' | 'room' | 'settings' | 'send' | 'sparkle' | 'memory' | 'gift' | 'movie' | 'walk' | 'hanger' | 'chair' | 'close' | 'google';

const paths: Record<IconName, string> = {
  chat: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-4.7A2.5 2.5 0 0 1 4 12.5z',
  together: 'M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7 1.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.8 20c.5-4 2.5-6 5.7-6s5.2 2 5.7 6m-1.2-5.1c.7-.3 1.5-.4 2.5-.4 2.8 0 4.6 1.8 5 5.5',
  look: 'M4 5h16M7 5c.3 2.4 1.9 3.5 5 3.5S16.7 7.4 17 5l2 15H5z',
  room: 'M3 10.5 12 3l9 7.5V21H3zM9 21v-6h6v6',
  settings: 'M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm8 3.5 2-1-2-3-2.3.4a8 8 0 0 0-1.1-1.1L17 5l-3-2-1 2a8 8 0 0 0-2 0l-1-2-3 2 .4 2.3a8 8 0 0 0-1.1 1.1L4 8l-2 3 2 1v2l-2 1 2 3 2.3-.4a8 8 0 0 0 1.1 1.1L7 21l3 2 1-2h2l1 2 3-2-.4-2.3a8 8 0 0 0 1.1-1.1L20 18l2-3-2-1z',
  send: 'M4 4 21 12 4 20l2.6-6.1L14 12l-7.4-1.9z',
  sparkle: 'm12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5z',
  memory: 'M8 4.5A3.5 3.5 0 0 0 4.5 8v1A3.5 3.5 0 0 0 3 15.5 3.5 3.5 0 0 0 6.5 19H9V5.5A1.5 1.5 0 0 0 7.5 4Zm8 0A3.5 3.5 0 0 1 19.5 8v1a3.5 3.5 0 0 1 1.5 6.5 3.5 3.5 0 0 1-3.5 3.5H15V5.5A1.5 1.5 0 0 1 16.5 4Z',
  gift: 'M3 10h18v11H3zM12 10v11M2 6h20v4H2zM12 6c-1-3-5-4-5-1 0 2 3 2 5 1Zm0 0c1-3 5-4 5-1 0 2-3 2-5 1Z',
  movie: 'M4 6h16v12H4zM8 6l2-3m3 3 2-3m-9 8h12',
  walk: 'M13 5.5A2.5 2.5 0 1 0 13 1a2.5 2.5 0 0 0 0 4.5Zm-1 2-3 4 3 2 2 6m-2-12 4 3 3-1m-7 4-4 6',
  hanger: 'M12 6a2 2 0 1 1 2-2c0 1.2-.8 1.7-2 2v2l9 6H3l9-6',
  chair: 'M6 4v9h12V4M6 10H4v6h16v-6h-2M7 16v5m10-5v5',
  close: 'M5 5l14 14M19 5 5 19',
  google: 'M21 12.2c0-.7-.1-1.4-.2-2H12v3.8h5c-.2 1.2-.9 2.2-1.9 2.9v2.5h3.1c1.8-1.7 2.8-4.1 2.8-7.2ZM12 21c2.6 0 4.8-.9 6.4-2.3l-3.1-2.5c-.9.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-4H3.4v2.6A9.7 9.7 0 0 0 12 21ZM6.6 13.1A5.8 5.8 0 0 1 6.3 11c0-.7.1-1.4.3-2.1V6.3H3.4A9.9 9.9 0 0 0 2.3 11c0 1.7.4 3.3 1.1 4.7l3.2-2.6ZM12 4.9c1.4 0 2.7.5 3.7 1.4l2.8-2.8A9.3 9.3 0 0 0 12 1 9.7 9.7 0 0 0 3.4 6.3l3.2 2.6c.8-2.3 2.9-4 5.4-4Z',
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={paths[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
