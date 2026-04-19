/**
 * @file
 * @brief Renders pi-usereq configuration menus with the shared pi.dev settings style.
 * @details Wraps `SettingsList` in one extension-command helper that exposes right-aligned current values, built-in circular scrolling, bottom-line descriptions, and a deterministic bridge for offline test harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering.
 */

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Container, SettingsList, Text, type Component, type SettingItem, type SettingsListTheme } from "@mariozechner/pi-tui";

/**
 * @brief Describes one selectable pi-usereq settings-menu choice.
 * @details Stores the stable action identifier, left-column label, right-column current value, and bottom-line description consumed by the shared settings-menu renderer. The interface is compile-time only and introduces no runtime cost.
 */
export interface PiUsereqSettingsMenuChoice {
  id: string;
  label: string;
  value: string;
  description: string;
}

/**
 * @brief Describes the offline bridge exposed by shared settings-menu components.
 * @details Lets deterministic harnesses and unit tests drive the same settings-menu choices by label without simulating raw terminal key streams. The interface is runtime-facing but carries no side effects by itself.
 */
export interface PiUsereqSettingsMenuBridge {
  title: string;
  choices: PiUsereqSettingsMenuChoice[];
  selectByLabel: (label: string) => boolean;
  cancel: () => void;
}

/**
 * @brief Represents a custom menu component augmented with the offline bridge.
 * @details Extends the generic TUI `Component` contract with one optional bridge field consumed only by deterministic test and debug harness adapters. The interface is compile-time only and introduces no runtime cost.
 */
export interface PiUsereqSettingsMenuComponent extends Component {
  __piUsereqSettingsMenu?: PiUsereqSettingsMenuBridge;
}

/**
 * @brief Builds the local settings-list theme used by pi-usereq configuration menus.
 * @details Derives left-label, right-value, description, cursor, and hint styles from the callback-local pi theme so menu rendering stays deterministic even when the global theme singleton is unavailable in tests or offline replay. Runtime is O(1). No external state is mutated.
 * @param[in] theme {{ fg: (color: string, text: string) => string; bold: (text: string) => string }} Callback-local pi theme adapter.
 * @return {SettingsListTheme} Settings-list theme used by pi-usereq menus.
 * @satisfies REQ-151
 */
function buildPiUsereqSettingsListTheme(theme: { fg: (color: string, text: string) => string; bold: (text: string) => string }): SettingsListTheme {
  return {
    label: (text: string, selected: boolean): string => selected ? theme.fg("accent", text) : text,
    value: (text: string, _selected: boolean): string => theme.fg("dim", text),
    description: (text: string): string => theme.fg("dim", text),
    cursor: theme.fg("accent", "› "),
    hint: (text: string): string => theme.fg("dim", text),
  };
}

/**
 * @brief Closes a settings menu immediately with one selected action identifier.
 * @details Provides the submenu callback used by `SettingsList` so pressing Enter on any menu row resolves the outer custom UI promise with the row identifier. Runtime is O(1). Side effects are limited to one custom-UI completion callback.
 * @param[in] choiceId {string} Stable choice identifier to emit.
 * @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
 * @return {Component} Immediate-completion submenu component.
 */
function createImmediateSelectionComponent(choiceId: string, done: (value?: string) => void): Component {
  queueMicrotask(() => {
    done(choiceId);
  });
  return {
    render(): string[] {
      return [];
    },
    invalidate(): void {
      return;
    },
  };
}

/**
 * @brief Builds `SettingsList` items from one menu-choice vector.
 * @details Copies labels, current values, and descriptions into `SettingItem` records and attaches a submenu that resolves the outer custom UI with the selected choice identifier. Runtime is O(n) in choice count. No external state is mutated.
 * @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
 * @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
 * @return {SettingItem[]} `SettingsList` item vector.
 */
function buildSettingItems(
  choices: PiUsereqSettingsMenuChoice[],
  done: (value?: string) => void,
): SettingItem[] {
  return choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    description: choice.description,
    currentValue: choice.value,
    submenu: () => createImmediateSelectionComponent(choice.id, done),
  }));
}

/**
 * @brief Renders one shared pi-usereq settings menu and resolves the selected action.
 * @details Uses `ctx.ui.custom(...)` plus `SettingsList` so every configuration menu shares pi.dev styling, right-aligned current values, circular scrolling, and bottom-line descriptions. The returned custom component also exposes an offline bridge for deterministic tests and debug harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] title {string} Menu title displayed in the heading and offline bridge.
 * @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
 * @return {Promise<string | undefined>} Selected choice identifier or `undefined` when cancelled.
 * @satisfies REQ-151, REQ-152, REQ-153, REQ-154
 */
export async function showPiUsereqSettingsMenu(
  ctx: ExtensionCommandContext,
  title: string,
  choices: PiUsereqSettingsMenuChoice[],
): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
    const container = new Container();
    const settingsList = new SettingsList(
      buildSettingItems(choices, done),
      Math.min(Math.max(choices.length, 1), 12),
      buildPiUsereqSettingsListTheme(theme),
      () => undefined,
      () => done(undefined),
    );
    container.addChild(new Text(theme.fg("accent", theme.bold(title)), 0, 0));
    container.addChild(new Text("", 0, 0));
    container.addChild(settingsList);

    const component: PiUsereqSettingsMenuComponent = {
      render(width: number): string[] {
        return container.render(width);
      },
      invalidate(): void {
        container.invalidate();
      },
      handleInput(data: string): void {
        settingsList.handleInput(data);
        tui.requestRender();
      },
      __piUsereqSettingsMenu: {
        title,
        choices,
        selectByLabel(label: string): boolean {
          const choice = choices.find((candidate) => candidate.label === label || candidate.id === label);
          if (!choice) {
            return false;
          }
          done(choice.id);
          return true;
        },
        cancel(): void {
          done(undefined);
        },
      },
    };
    return component;
  });
}
