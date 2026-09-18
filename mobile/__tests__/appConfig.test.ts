import config from '../app.config';
import pkg from '../package.json';

describe('app config', () => {
  it('keeps app version aligned with package.json (P2-1)', () => {
    expect(config.version).toBe('0.1.0');
    expect(pkg.version).toBe(config.version);
  });

  it('keeps the approved Android package and scheme', () => {
    expect(config.android?.package).toBe('com.wanghoufan.placejournal');
    expect(config.scheme).toBe('com.wanghoufan.placejournal');
  });

  it('blocks audio recording and background location', () => {
    const blocked = config.android?.blockedPermissions ?? [];
    expect(blocked).toContain('android.permission.RECORD_AUDIO');
    expect(blocked).toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(blocked).toContain('android.permission.FOREGROUND_SERVICE_LOCATION');
  });
});
