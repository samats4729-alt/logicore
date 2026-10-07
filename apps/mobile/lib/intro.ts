import { create } from 'zustand';

/**
 * Заставка при запуске и её передача экрану входа.
 *
 * playing — идёт ролик и переход «белое → чёрное», экран входа под заставкой ещё скрыт;
 * handoff — знак летит на своё место в шапке входа, а сам экран проявляется;
 * done — заставки больше нет (и при следующих входах после выхода её не будет).
 *
 * target — где на экране входа стоит знак: туда заставка и доводит свой знак.
 */
export type IntroState = 'playing' | 'handoff' | 'done';

type Rect = { x: number; y: number; width: number; height: number };

/** Элемент, у которого можно спросить положение на экране (типы react-native в проекте отключены — описываем сами). */
export type Measurable = { measureInWindow(cb: (x: number, y: number, width: number, height: number) => void): void };

export const useIntro = create<{
    state: IntroState;
    target: Rect | null;
    setState: (state: IntroState) => void;
    setTarget: (target: Rect | null) => void;
}>((set) => ({
    state: 'playing',
    target: null,
    setState: (state) => set({ state }),
    setTarget: (target) => set({ target }),
}));
