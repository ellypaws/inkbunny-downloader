declare module "gsap" {
  export namespace gsap {
    namespace core {
      interface Animation {
        kill(): void;
      }

      type Tween = Animation;

      interface Timeline extends Animation {
        eventCallback(
          type: string,
          callback?: (() => void) | null,
        ): Timeline;
        fromTo(...args: readonly unknown[]): Timeline;
        play(from?: number | string): Timeline;
        set(...args: readonly unknown[]): Timeline;
        to(...args: readonly unknown[]): Timeline;
      }
    }

    interface Context {
      revert(): void;
    }

    interface TweenVars {
      [key: string]: unknown;
    }

    interface Utils {
      random(min: number, max: number): number;
    }
  }

  export const gsap: {
    context(
      callback: () => void,
      scope?:
        | Element
        | Document
        | string
        | null
        | {
            current: Element | null;
          },
    ): gsap.Context;
    getProperty(target: unknown, property: string): unknown;
    killTweensOf(targets: unknown): void;
    set(targets: unknown, vars: gsap.TweenVars): void;
    timeline(vars?: gsap.TweenVars): gsap.core.Timeline;
    to(targets: unknown, vars: gsap.TweenVars): gsap.core.Tween;
    utils: gsap.Utils;
  };
}

declare module "motion/react" {
  import type {
    ForwardRefExoticComponent,
    HTMLAttributes,
    PropsWithChildren,
    RefAttributes,
  } from "react";

  export interface MotionValue<T> {
    get(): T;
    jump(value: T): void;
  }

  export interface AnimationPlaybackControls {
    stop(): void;
  }

  export interface MotionTransition {
    [key: string]: unknown;
  }

  export interface MotionStyle {
    [key: string]: unknown;
  }

  export interface MotionDivProps
    extends PropsWithChildren<Omit<HTMLAttributes<HTMLDivElement>, "style">> {
    animate?: unknown;
    transition?: MotionTransition;
    style?: MotionStyle;
    whileHover?: unknown;
    whileTap?: unknown;
    onHoverStart?: () => void;
    onHoverEnd?: () => void;
  }

  export const motion: {
    div: ForwardRefExoticComponent<
      MotionDivProps & RefAttributes<HTMLDivElement>
    >;
  };

  export function animate(
    value: MotionValue<number>,
    to: number,
    options?: MotionTransition,
  ): AnimationPlaybackControls;

  export function useMotionValue<T>(initial: T): MotionValue<T>;

  export function useMotionValueEvent<T>(
    value: MotionValue<T>,
    event: "change",
    callback: (latest: T) => void,
  ): void;

  export function useTransform<T>(transformer: () => T): MotionValue<T>;

  export function useTransform<TInput, TOutput>(
    value: MotionValue<TInput>,
    input: readonly TInput[],
    output: readonly TOutput[],
  ): MotionValue<TOutput>;
}
