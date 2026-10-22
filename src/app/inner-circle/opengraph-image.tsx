import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

// The card people see when the Inner Circle link is pasted into WhatsApp, X, iMessage or Slack.
export const alt = 'The Inner Circle: Beta Access · Visiowave Studios';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function InnerCircleOpenGraphImage() {
  const plate = await readFile(path.join(process.cwd(), 'public', 'studio-plate-5.jpg'));
  const background = `data:image/jpeg;base64,${plate.toString('base64')}`;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#090a09' }}>
        <img
          src={background}
          alt=""
          width={1200}
          height={630}
          style={{ position: 'absolute', left: 300, top: 0, width: 960, height: 630, objectFit: 'cover', opacity: 0.85 }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: 'linear-gradient(90deg, #090a09 38%, rgba(9,10,9,0.75) 58%, rgba(9,10,9,0.1) 100%)',
          }}
        />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: '#eeeae1', fontSize: 22, letterSpacing: 6, fontWeight: 600 }}>
            VISIOWAVE STUDIOS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', color: '#d9c08a', fontSize: 22, letterSpacing: 8 }}>PRIVATE ACCESS</div>
            <div style={{ display: 'flex', marginTop: 18, color: '#eeeae1', fontSize: 84, fontWeight: 500, lineHeight: 1, letterSpacing: -2 }}>
              The Inner Circle
            </div>
            <div style={{ display: 'flex', marginTop: 10, color: '#f3e5c0', fontSize: 84, fontStyle: 'italic', lineHeight: 1, letterSpacing: -2 }}>
              Beta access.
            </div>
            <div style={{ display: 'flex', marginTop: 28, maxWidth: 560, color: '#b9b6ac', fontSize: 26, lineHeight: 1.4 }}>
              Multi-shot films. True character continuity. 1:1 lip-sync.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                display: 'flex',
                padding: '14px 28px',
                borderRadius: 999,
                background: 'linear-gradient(100deg, #f3e5c0, #d9c08a 45%, #b08d52)',
                color: '#14110b',
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: 3,
              }}
            >
              REQUEST YOUR INVITE
            </div>
            <div style={{ display: 'flex', color: '#b9b6ac', fontSize: 20 }}>Limited spots available</div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
