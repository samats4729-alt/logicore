/** Предпросмотр в браузере: фонового слежения за рейсом там нет. */
export const startBackgroundTracking = async (): Promise<boolean> => false;
export const stopBackgroundTracking = async (): Promise<void> => undefined;
export const isTrackingActive = async (): Promise<boolean> => false;
export const getCurrentLocation = async (): Promise<null> => null;
