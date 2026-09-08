import { SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8 } from '@/lib/utils';

export type SourceProbe = {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  hasError?: boolean;
};

function sourceKey(source: SearchResult): string {
  return `${source.source}-${source.id}`;
}

function parseSpeedKBps(speedStr: string): number {
  if (speedStr === '未知' || speedStr === '测量中...') return 0;
  const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  return match[2] === 'MB/s' ? value * 1024 : value;
}

function calculateSourceScore(
  testResult: SourceProbe,
  maxSpeed: number,
  minPing: number,
  maxPing: number
): number {
  let score = 0;

  const qualityScore = (() => {
    switch (testResult.quality) {
      case '4K':
        return 100;
      case '2K':
        return 85;
      case '1080p':
        return 75;
      case '720p':
        return 60;
      case '480p':
        return 40;
      case 'SD':
        return 20;
      default:
        return 0;
    }
  })();
  score += qualityScore * 0.4;

  const speedScore = (() => {
    if (testResult.loadSpeed === '未知' || testResult.loadSpeed === '测量中...') {
      return 30;
    }
    const speedKBps = parseSpeedKBps(testResult.loadSpeed);
    if (!speedKBps) return 30;
    return Math.min(100, Math.max(0, (speedKBps / maxSpeed) * 100));
  })();
  score += speedScore * 0.4;

  const pingScore = (() => {
    const ping = testResult.pingTime;
    if (ping <= 0) return 0;
    if (maxPing === minPing) return 100;
    return Math.min(100, Math.max(0, ((maxPing - ping) / (maxPing - minPing)) * 100));
  })();
  score += pingScore * 0.2;

  return Math.round(score * 100) / 100;
}

async function probeOne(source: SearchResult): Promise<SourceProbe | null> {
  if (!source.episodes || source.episodes.length === 0) {
    return null;
  }
  const episodeUrl =
    source.episodes.length > 1 ? source.episodes[1] : source.episodes[0];
  try {
    return await getVideoResolutionFromM3u8(episodeUrl);
  } catch {
    return null;
  }
}

/**
 * 按播放页「换源」同一套测速规则选当前网络下最优线路。
 * 全部 ping 不通时返回 best = null。
 */
export async function pickBestSource(sources: SearchResult[]): Promise<{
  best: SearchResult | null;
  probes: Map<string, SourceProbe>;
}> {
  const probes = new Map<string, SourceProbe>();
  if (!sources.length) {
    return { best: null, probes };
  }
  if (sources.length === 1) {
    const only = sources[0];
    const probe = await probeOne(only);
    if (probe) {
      probes.set(sourceKey(only), probe);
      return { best: only, probes };
    }
    return { best: null, probes };
  }

  const batchSize = Math.ceil(sources.length / 2);
  const successful: Array<{ source: SearchResult; testResult: SourceProbe }> =
    [];

  for (let start = 0; start < sources.length; start += batchSize) {
    const batch = sources.slice(start, start + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (source) => {
        const testResult = await probeOne(source);
        return { source, testResult };
      })
    );
    batchResults.forEach(({ source, testResult }) => {
      if (!testResult) return;
      probes.set(sourceKey(source), testResult);
      successful.push({ source, testResult });
    });
  }

  if (!successful.length) {
    return { best: null, probes };
  }

  const validSpeeds = successful
    .map((item) => parseSpeedKBps(item.testResult.loadSpeed))
    .filter((speed) => speed > 0);
  const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 1024;

  const validPings = successful
    .map((item) => item.testResult.pingTime)
    .filter((ping) => ping > 0);
  const minPing = validPings.length > 0 ? Math.min(...validPings) : 50;
  const maxPing = validPings.length > 0 ? Math.max(...validPings) : 1000;

  const ranked = successful
    .map((item) => ({
      ...item,
      score: calculateSourceScore(item.testResult, maxSpeed, minPing, maxPing),
    }))
    .sort((a, b) => b.score - a.score);

  return { best: ranked[0].source, probes };
}
