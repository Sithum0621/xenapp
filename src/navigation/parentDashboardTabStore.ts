export type ParentTab = 'home' | 'classes' | 'games' | 'chats' | 'settings';

let currentTab: ParentTab = 'home';

export function setParentDashboardTab(tab: ParentTab): void {
  currentTab = tab;
}

export function getParentDashboardTab(): ParentTab {
  return currentTab;
}
