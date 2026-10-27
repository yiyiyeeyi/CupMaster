export interface GrinderSetting { grinder?: string; setting?: string; }
export interface GrinderCalibration { grinder: string; sourceUrl: string; points: readonly { setting: number; microns: number }[]; }
// Model names alone are not calibration data. No verified table has been supplied.
export const grinderCalibrations: readonly GrinderCalibration[] = [];
export function grindMicrons(value: GrinderSetting, calibrations = grinderCalibrations): number | undefined {
  const calibration = calibrations.find(item=>item.grinder===value.grinder && item.sourceUrl.startsWith("https://"));
  if (!calibration || value.setting === undefined || !value.setting.trim()) return undefined;
  return calibration.points.find(point=>point.setting===Number(value.setting))?.microns;
}
export function changeGrinder(current: GrinderSetting, grinder: string, settingFixed: boolean, calibrations = grinderCalibrations): GrinderSetting {
  const microns=grindMicrons(current,calibrations);
  if (settingFixed || microns === undefined) return {...current,grinder};
  const match=calibrations.find(item=>item.grinder===grinder && item.sourceUrl.startsWith("https://"))?.points.find(point=>point.microns===microns);
  return {...current,grinder,...(match && {setting:String(match.setting)})};
}
