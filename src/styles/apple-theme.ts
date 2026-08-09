import type { GlobalThemeOverrides } from 'naive-ui'

/**
 * Apple-style theme overrides for Naive UI.
 * Light mode mirrors macOS Sonoma: frosted materials, SF-style colors,
 * generous radii, soft shadows, and restrained accent palette.
 */

export const lightThemeOverrides: GlobalThemeOverrides = {
  common: {
    // Apple system blue — the primary accent
    primaryColor: '#0071E3',
    primaryColorHover: '#0077ED',
    primaryColorPressed: '#006EDB',
    primaryColorSuppl: '#0071E3',

    // Apple system colors
    infoColor: '#0071E3',
    infoColorHover: '#0077ED',
    infoColorPressed: '#006EDB',
    successColor: '#34C759',
    successColorHover: '#2DBE50',
    successColorPressed: '#28A845',
    warningColor: '#FF9500',
    warningColorHover: '#FF8C00',
    warningColorPressed: '#E68400',
    errorColor: '#FF3B30',
    errorColorHover: '#FF352B',
    errorColorPressed: '#E62E24',

    // Typography — SF Pro inspired system stack
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif',
    fontFamilyMono: '"SF Mono", "Fira Code", "JetBrains Mono", ui-monospace, monospace',
    fontSize: '14px',

    // Apple-style rounded corners
    borderRadius: '10px',
    borderRadiusSmall: '8px',

    // Text colors — Apple's layered grays
    textColorBase: '#1D1D1F',
    textColor1: '#1D1D1F',
    textColor2: '#424245',
    textColor3: '#6E6E73',
    textColorDisabled: '#AEAEB2',
    placeholderColor: '#8E8E93',
    iconColor: '#6E6E73',
    iconColorHover: '#1D1D1F',

    // Borders — barely-there hairlines
    borderColor: 'rgba(0, 0, 0, 0.08)',
    dividerColor: 'rgba(0, 0, 0, 0.06)',

    // Backgrounds — warm, layered whites
    bodyColor: '#F5F5F7',
    cardColor: '#FFFFFF',
    modalColor: '#FFFFFF',
    popoverColor: '#FFFFFF',
    tableHeaderColor: '#FBFBFD',
    inputColor: '#F5F5F7',
    inputColorDisabled: '#EFEFF2',
    actionColor: '#F5F5F7',
    hoverColor: 'rgba(0, 0, 0, 0.04)',
    pressedColor: 'rgba(0, 0, 0, 0.06)',

    // Font weights
    fontWeightStrong: '600',
  },

  Button: {
    fontWeight: '500',
    borderRadiusMedium: '980px',
    borderRadiusSmall: '980px',
    borderRadiusTiny: '980px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
    heightMedium: '36px',
    heightSmall: '30px',
    paddingMedium: '0 20px',
    paddingSmall: '0 16px',
  },

  Card: {
    borderRadius: '16px',
    borderRadiusSmall: '14px',
    paddingMedium: '20px',
    paddingSmall: '16px',
    titleFontSizeMedium: '16px',
    titleFontSizeSmall: '15px',
    titleFontWeight: '600',
    color: '#FFFFFF',
    colorModal: '#FFFFFF',
    borderColor: 'rgba(0, 0, 0, 0.06)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.02), 0 4px 16px rgba(0,0,0,0.04)',
  },

  Input: {
    borderRadius: '10px',
    borderHover: '1px solid rgba(0, 0, 0, 0.15)',
    borderFocus: '1px solid #0071E3',
    boxShadowFocus: '0 0 0 3px rgba(0, 113, 227, 0.12)',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
  },

  DataTable: {
    borderRadius: '12px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
    thFontWeight: '600',
    thColor: '#FBFBFD',
    thColorSorted: '#F5F5F7',
    tdColorHover: 'rgba(0, 113, 227, 0.04)',
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },

  Menu: {
    borderRadius: '10px',
    itemHeight: '38px',
    itemColorHover: 'rgba(0, 0, 0, 0.04)',
    itemColorActive: 'rgba(0, 113, 227, 0.08)',
    itemColorActiveHover: 'rgba(0, 113, 227, 0.10)',
    itemTextColorActive: '#0071E3',
    itemTextColorActiveHover: '#0071E3',
    itemTextColorHover: '#1D1D1F',
    itemIconColorActive: '#0071E3',
    itemIconColorHover: '#1D1D1F',
    fontSize: '14px',
    fontWeight: '400',
  },

  Modal: {
    borderRadius: '18px',
  },

  Drawer: {
    // single value — Naive applies it to the screen-facing corners itself
    borderRadius: '20px',
  },

  Tag: {
    borderRadius: '8px',
    fontWeightStrong: '600',
  },

  Tabs: {
    tabFontWeightActive: '600',
    tabTextColorActive: '#1D1D1F',
    tabTextColorActiveHover: '#1D1D1F',
    barColor: '#0071E3',
  },

  Descriptions: {
    borderRadius: '10px',
    thFontWeight: '500',
    thColor: 'rgba(0, 0, 0, 0.02)',
  },

  Tooltip: {
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
  },

  Form: {
    labelFontSizeTopMedium: '13px',
    labelFontSizeTopSmall: '13px',
    labelTextColor: '#6E6E73',
    labelFontWeight: '500',
  },

  Spin: {
    color: '#0071E3',
  },

  Pagination: {
    itemBorderRadius: '8px',
  },

  Select: {
    borderRadius: '10px',
    borderHover: '1px solid rgba(0, 0, 0, 0.15)',
    borderFocus: '1px solid #0071E3',
    boxShadowFocus: '0 0 0 3px rgba(0, 113, 227, 0.12)',
  },

  InputNumber: {
    borderRadius: '10px',
  },

  Popover: {
    borderRadius: '14px',
    padding: '12px 16px',
  },

  Dropdown: {
    borderRadius: '12px',
  },

  Empty: {
    fontSize: '14px',
    textColor: '#8E8E93',
  },
}

export const darkThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#0A84FF',
    primaryColorHover: '#1A8FFF',
    primaryColorPressed: '#0078F0',
    primaryColorSuppl: '#0A84FF',

    infoColor: '#0A84FF',
    infoColorHover: '#1A8FFF',
    infoColorPressed: '#0078F0',
    successColor: '#30D158',
    successColorHover: '#3ADF68',
    successColorPressed: '#28C04E',
    warningColor: '#FF9F0A',
    warningColorHover: '#FFAA1E',
    warningColorPressed: '#E68900',
    errorColor: '#FF453A',
    errorColorHover: '#FF554A',
    errorColorPressed: '#E63A30',

    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif',
    fontFamilyMono: '"SF Mono", "Fira Code", "JetBrains Mono", ui-monospace, monospace',
    fontSize: '14px',

    borderRadius: '10px',
    borderRadiusSmall: '8px',

    textColorBase: '#F5F5F7',
    textColor1: '#F5F5F7',
    textColor2: '#D1D1D6',
    textColor3: '#8E8E93',
    textColorDisabled: '#48484A',
    placeholderColor: '#636366',
    iconColor: '#8E8E93',
    iconColorHover: '#F5F5F7',

    borderColor: 'rgba(255, 255, 255, 0.08)',
    dividerColor: 'rgba(255, 255, 255, 0.06)',

    bodyColor: '#000000',
    cardColor: '#1C1C1E',
    modalColor: '#2C2C2E',
    popoverColor: '#2C2C2E',
    tableHeaderColor: '#1C1C1E',
    inputColor: '#2C2C2E',
    inputColorDisabled: '#1C1C1E',
    actionColor: '#2C2C2E',
    hoverColor: 'rgba(255, 255, 255, 0.06)',
    pressedColor: 'rgba(255, 255, 255, 0.08)',

    fontWeightStrong: '600',
  },

  Button: {
    fontWeight: '500',
    borderRadiusMedium: '980px',
    borderRadiusSmall: '980px',
    borderRadiusTiny: '980px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
    heightMedium: '36px',
    heightSmall: '30px',
    paddingMedium: '0 20px',
    paddingSmall: '0 16px',
  },

  Card: {
    borderRadius: '16px',
    borderRadiusSmall: '14px',
    paddingMedium: '20px',
    paddingSmall: '16px',
    titleFontSizeMedium: '16px',
    titleFontSizeSmall: '15px',
    titleFontWeight: '600',
    color: '#1C1C1E',
    colorModal: '#2C2C2E',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.1), 0 4px 16px rgba(0,0,0,0.12)',
  },

  Input: {
    borderRadius: '10px',
    borderHover: '1px solid rgba(255, 255, 255, 0.15)',
    borderFocus: '1px solid #0A84FF',
    boxShadowFocus: '0 0 0 3px rgba(10, 132, 255, 0.18)',
  },

  DataTable: {
    borderRadius: '12px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
    thFontWeight: '600',
    thColor: '#1C1C1E',
    thColorSorted: '#2C2C2E',
    tdColorHover: 'rgba(10, 132, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },

  Menu: {
    borderRadius: '10px',
    itemHeight: '38px',
    itemColorHover: 'rgba(255, 255, 255, 0.06)',
    itemColorActive: 'rgba(10, 132, 255, 0.12)',
    itemColorActiveHover: 'rgba(10, 132, 255, 0.15)',
    itemTextColorActive: '#0A84FF',
    itemTextColorActiveHover: '#0A84FF',
    itemTextColorHover: '#F5F5F7',
    itemIconColorActive: '#0A84FF',
    itemIconColorHover: '#F5F5F7',
    fontSize: '14px',
    fontWeight: '400',
  },

  Modal: {
    borderRadius: '18px',
  },

  Drawer: {
    // single value — Naive applies it to the screen-facing corners itself
    borderRadius: '20px',
  },

  Tag: {
    borderRadius: '8px',
    fontWeightStrong: '600',
  },

  Tabs: {
    tabFontWeightActive: '600',
    tabTextColorActive: '#F5F5F7',
    tabTextColorActiveHover: '#F5F5F7',
    barColor: '#0A84FF',
  },

  Descriptions: {
    borderRadius: '10px',
    thFontWeight: '500',
    thColor: 'rgba(255, 255, 255, 0.03)',
  },

  Tooltip: {
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '12px',
  },

  Form: {
    labelFontSizeTopMedium: '13px',
    labelFontSizeTopSmall: '13px',
    labelTextColor: '#8E8E93',
    labelFontWeight: '500',
  },

  Spin: {
    color: '#0A84FF',
  },

  Pagination: {
    itemBorderRadius: '8px',
  },

  Select: {
    borderRadius: '10px',
    borderHover: '1px solid rgba(255, 255, 255, 0.15)',
    borderFocus: '1px solid #0A84FF',
    boxShadowFocus: '0 0 0 3px rgba(10, 132, 255, 0.18)',
  },

  InputNumber: {
    borderRadius: '10px',
  },

  Popover: {
    borderRadius: '14px',
    padding: '12px 16px',
  },

  Dropdown: {
    borderRadius: '12px',
  },

  Empty: {
    fontSize: '14px',
    textColor: '#636366',
  },
}
