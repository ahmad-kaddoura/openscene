import type { Scene } from '@/core/types';

// Small public-domain sample clips so the node can actually play a video
// while the real generation API isn't wired up yet.
const SAMPLE_CLIPS = [
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBigBuckBunny.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
];

function placeholderFrameUrl(title: string, order: number): string {
  const hue = (order * 67) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:hsl(${hue},55%,35%)"/>
        <stop offset="100%" style="stop-color:hsl(${(hue + 40) % 360},45%,18%)"/>
      </linearGradient>
    </defs>
    <rect width="540" height="960" fill="url(#g)"/>
    <text x="270" y="460" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="28" font-weight="600">${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>
    <text x="270" y="510" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="system-ui,sans-serif" font-size="16">Scene ${order + 1}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Mock generation until real image/video APIs are wired. */
export async function generateSceneAssets(
  scene: Scene,
  onProgress: (pct: number) => void,
): Promise<{ startFrameUrl: string; videoUrl: string }> {
  const milestones = [8, 22, 38, 55, 72, 88, 100];
  for (const pct of milestones) {
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 250));
    onProgress(pct);
  }

  const startFrameUrl =
    scene.startFrameUrl ??
    scene.referenceImageUrls?.[0] ??
    placeholderFrameUrl(scene.title, scene.order);
  const videoUrl = SAMPLE_CLIPS[scene.order % SAMPLE_CLIPS.length];

  return { startFrameUrl, videoUrl };
}
