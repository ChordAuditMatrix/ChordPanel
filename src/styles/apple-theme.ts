import type { GlobalThemeOverrides } from 'naive-ui'

/**
 * Naive UI theme overrides for ChordPanel.
 *
 * Visual policy (V3): a business management console, not a product showcase.
 *  - Page/base is true #FFFFFF in light mode and true #000000 in dark mode.
 *  - Cards, inputs, table headers and dialogs use adjacent neutral tones and
 *    1px hairlines; hierarchy comes from borders, never from elevation.
 *  - No gradients, no decorative shadows, no translucent surfaces.
 *  - A single restrained accent (blue) carries primary actions and focus.
 *
 * The dark palette is neutral, not "deep sea": surfaces are gray near-black,
 * never saturated blue.
 */

export const lightThemeOverrides: GlobalThemeOverrides = {
  common: {
    // Restrained accent — professional console blue
    primaryColor: '#2769DC',
    primaryColorHover: '#1E57C0',
    primaryColorPressed: '#16459F',
    primaryColorSuppl: '#2769DC',

    // Semantic colors, darkened for readable text on white
    infoColor: '#2769DC',
    infoColorHover: '#1E57C0',
    infoColorPressed: '#16459F',
    successColor: '#1A7F37',
    successColorHover: '#166B2D',
    successColorPressed: '#125425',
    warningColor: '#9A6700',
    warningColorHover: '#855800',
    warningColorPressed: '#6F4A00',
    errorColor: '#C0392B',
    errorColorHover: '#A93226',
    errorColorPressed: '#912A20',

    // Typography — system stack, no bundled webfonts
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif',
    fontFamilyMono: '"SF Mono", "Fira Code", "JetBrains Mono", ui-monospace, monospace',
    fontSize: '14px',

    // Modest radii — controls read as tools, not pills
    borderRadius: '6px',
    borderRadiusSmall: '4px',

    // Text — neutral scale from the V3 palette
    textColorBase: '#181B20',
    textColor1: '#181B20',
    textColor2: '#3F454E',
    textColor3: '#6B7280',
    textColorDisabled: '#A6ACB6',
    placeholderColor: '#8A919C',
    iconColor: '#6B7280',
    iconColorHover: '#181B20',

    // Hairlines instead of elevation
    borderColor: '#E5E7EB',
    dividerColor: '#EDEFF2',

    // Surfaces — pure white base, neutral adjacent tones for grouped content
    bodyColor: '#FFFFFF',
    cardColor: '#FFFFFF',
    modalColor: '#FFFFFF',
    popoverColor: '#FFFFFF',
    tableHeaderColor: '#F7F8FA',
    inputColor: '#FFFFFF',
    inputColorDisabled: '#F2F4F6',
    actionColor: '#F7F8FA',
    hoverColor: '#F5F6F8',
    pressedColor: '#EFF1F4',

    // Flat surfaces: no shadow anywhere in the shell
    boxShadow1: 'none',
    boxShadow2: 'none',
    boxShadow3: 'none',

    fontWeightStrong: '600',
  },

  Button: {
    fontWeight: '500',
    borderRadiusMedium: '6px',
    borderRadiusSmall: '5px',
    borderRadiusTiny: '4px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
    heightMedium: '36px',
    heightSmall: '30px',
    paddingMedium: '0 16px',
    paddingSmall: '0 12px',
  },

  Card: {
    borderRadius: '8px',
    paddingMedium: '16px',
    paddingSmall: '14px',
    titleFontSizeMedium: '15px',
    titleFontSizeSmall: '14px',
    titleFontWeight: '600',
    color: '#FFFFFF',
    colorModal: '#FFFFFF',
    borderColor: '#E5E7EB',
    boxShadow: 'none',
  },

  Input: {
    borderRadius: '6px',
    border: '1px solid #E5E7EB',
    borderHover: '1px solid #C7CCD4',
    borderFocus: '1px solid #2769DC',
    boxShadowFocus: '0 0 0 2px rgba(39, 105, 220, 0.18)',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
  },

  DataTable: {
    borderRadius: '8px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
    thFontWeight: '600',
    thColor: '#F7F8FA',
    thColorSorting: '#F1F3F6',
    tdColorHover: '#F7F8FA',
    borderColor: '#E5E7EB',
  },

  Menu: {
    borderRadius: '4px',
    itemHeight: '36px',
    itemColorHover: '#F5F6F8',
    itemColorActive: '#EEF3FD',
    itemColorActiveHover: '#E6EEFC',
    itemTextColorActive: '#2769DC',
    itemTextColorActiveHover: '#1E57C0',
    itemTextColorHover: '#181B20',
    itemIconColorActive: '#2769DC',
    itemIconColorHover: '#181B20',
    fontSize: '14px',
    fontWeight: '400',
  },

  Modal: {
    borderRadius: '10px',
    // Scrim + solid surface separate the dialog; no elevation
    boxShadow: 'none',
  },

  Drawer: {
    // Edge-anchored panel: square corners read as a working surface, not a card
    borderRadius: '0',
    boxShadow: 'none',
  },

  Tag: {
    borderRadius: '4px',
    fontWeightStrong: '500',
  },

  Tabs: {
    tabFontWeightActive: '600',
    tabTextColorActiveLine: '#181B20',
    tabTextColorHoverLine: '#2769DC',
    barColor: '#2769DC',
  },

  Descriptions: {
    borderRadius: '4px',
    thFontWeight: '500',
    thColor: '#F7F8FA',
  },

  Tooltip: {
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '12px',
    // Dark chip in both themes; a 0-blur ring replaces elevation
    boxShadow: '0 0 0 1px #2C3138',
  },

  Form: {
    labelFontSizeTopMedium: '13px',
    labelFontSizeTopSmall: '13px',
    labelTextColor: '#6B7280',
    labelFontWeight: '500',
  },

  Spin: {
    color: '#2769DC',
  },

  Pagination: {
    itemBorderRadius: '4px',
  },

  Select: {
    // Select's drop-down is a raw popover: the menu owns its own hairline
    menuBoxShadow: '0 0 0 1px #E5E7EB',
    // The visible control is Naive's InternalSelection peer
    peers: {
      InternalSelection: {
        borderRadius: '6px',
        borderHover: '1px solid #C7CCD4',
        borderFocus: '1px solid #2769DC',
        boxShadowFocus: '0 0 0 2px rgba(39, 105, 220, 0.18)',
      },
    },
  },

  InputNumber: {
    borderRadius: '6px',
  },

  Popover: {
    borderRadius: '8px',
    padding: '10px 14px',
    // Hairline ring: floating surfaces need an edge, not a drop shadow
    boxShadow: '0 0 0 1px #E5E7EB',
  },

  Dropdown: {
    borderRadius: '8px',
    // Dropdown paints through a Popover peer
    peers: {
      Popover: { boxShadow: '0 0 0 1px #E5E7EB' },
    },
  },

  Empty: {
    fontSize: '14px',
    textColor: '#8A919C',
  },
}

export const darkThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#80AAFF',
    primaryColorHover: '#96B9FF',
    primaryColorPressed: '#6E9AF2',
    primaryColorSuppl: '#80AAFF',

    infoColor: '#80AAFF',
    infoColorHover: '#96B9FF',
    infoColorPressed: '#6E9AF2',
    successColor: '#3FB950',
    successColorHover: '#4CC95D',
    successColorPressed: '#34A044',
    warningColor: '#D29922',
    warningColorHover: '#E0A72E',
    warningColorPressed: '#B8871A',
    errorColor: '#F0736E',
    errorColorHover: '#F58A85',
    errorColorPressed: '#D96260',

    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif',
    fontFamilyMono: '"SF Mono", "Fira Code", "JetBrains Mono", ui-monospace, monospace',
    fontSize: '14px',

    borderRadius: '6px',
    borderRadiusSmall: '4px',

    textColorBase: '#F2F3F5',
    textColor1: '#F2F3F5',
    textColor2: '#C6CBD2',
    textColor3: '#A4A9B1',
    textColorDisabled: '#5C6169',
    placeholderColor: '#7A808A',
    iconColor: '#A4A9B1',
    iconColorHover: '#F2F3F5',

    borderColor: '#31343A',
    dividerColor: '#26292E',

    // Pure black base; neutral gray surfaces above it
    bodyColor: '#000000',
    cardColor: '#101113',
    modalColor: '#17191C',
    popoverColor: '#17191C',
    tableHeaderColor: '#17191C',
    inputColor: '#17191C',
    inputColorDisabled: '#14161A',
    actionColor: '#17191C',
    hoverColor: '#1B1E22',
    pressedColor: '#222428',

    boxShadow1: 'none',
    boxShadow2: 'none',
    boxShadow3: 'none',

    fontWeightStrong: '600',
  },

  Button: {
    fontWeight: '500',
    borderRadiusMedium: '6px',
    borderRadiusSmall: '5px',
    borderRadiusTiny: '4px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
    heightMedium: '36px',
    heightSmall: '30px',
    paddingMedium: '0 16px',
    paddingSmall: '0 12px',
  },

  Card: {
    borderRadius: '8px',
    paddingMedium: '16px',
    paddingSmall: '14px',
    titleFontSizeMedium: '15px',
    titleFontSizeSmall: '14px',
    titleFontWeight: '600',
    color: '#101113',
    colorModal: '#17191C',
    borderColor: '#31343A',
    boxShadow: 'none',
  },

  Input: {
    borderRadius: '6px',
    border: '1px solid #31343A',
    borderHover: '1px solid #454A52',
    borderFocus: '1px solid #80AAFF',
    boxShadowFocus: '0 0 0 2px rgba(128, 170, 255, 0.24)',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
  },

  DataTable: {
    borderRadius: '8px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
    thFontWeight: '600',
    thColor: '#17191C',
    thColorSorting: '#222428',
    tdColorHover: '#17191C',
    borderColor: '#31343A',
  },

  Menu: {
    borderRadius: '4px',
    itemHeight: '36px',
    itemColorHover: '#1B1E22',
    itemColorActive: '#1F2837',
    itemColorActiveHover: '#243046',
    itemTextColorActive: '#9AC1FF',
    itemTextColorActiveHover: '#B6D2FF',
    itemTextColorHover: '#F2F3F5',
    itemIconColorActive: '#9AC1FF',
    itemIconColorHover: '#F2F3F5',
    fontSize: '14px',
    fontWeight: '400',
  },

  Modal: {
    borderRadius: '10px',
    boxShadow: 'none',
  },

  Drawer: {
    borderRadius: '0',
    boxShadow: 'none',
  },

  Tag: {
    borderRadius: '4px',
    fontWeightStrong: '500',
  },

  Tabs: {
    tabFontWeightActive: '600',
    tabTextColorActiveLine: '#F2F3F5',
    tabTextColorHoverLine: '#80AAFF',
    barColor: '#80AAFF',
  },

  Descriptions: {
    borderRadius: '4px',
    thFontWeight: '500',
    thColor: '#17191C',
  },

  Tooltip: {
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '12px',
    boxShadow: '0 0 0 1px #2C3138',
  },

  Form: {
    labelFontSizeTopMedium: '13px',
    labelFontSizeTopSmall: '13px',
    labelTextColor: '#A4A9B1',
    labelFontWeight: '500',
  },

  Spin: {
    color: '#80AAFF',
  },

  Pagination: {
    itemBorderRadius: '4px',
  },

  Select: {
    menuBoxShadow: '0 0 0 1px #31343A',
    peers: {
      InternalSelection: {
        borderRadius: '6px',
        borderHover: '1px solid #454A52',
        borderFocus: '1px solid #80AAFF',
        boxShadowFocus: '0 0 0 2px rgba(128, 170, 255, 0.24)',
      },
    },
  },

  InputNumber: {
    borderRadius: '6px',
  },

  Popover: {
    borderRadius: '8px',
    padding: '10px 14px',
    boxShadow: '0 0 0 1px #31343A',
  },

  Dropdown: {
    borderRadius: '8px',
    peers: {
      Popover: { boxShadow: '0 0 0 1px #31343A' },
    },
  },

  Empty: {
    fontSize: '14px',
    textColor: '#7A808A',
  },
}
