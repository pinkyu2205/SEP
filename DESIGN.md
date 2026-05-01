---
design:
  colors:
    primary:
      50: "#EEF2FF"
      100: "#E0E7FF"
      400: "#818CF8"
      500: "#6366F1"
      600: "#4F46E5"
      700: "#4338CA"
      800: "#3730A3"
    accent:
      400: "#22D3EE"
      500: "#06B6D4"
      600: "#0891B2"
    semantic:
      success: "#10B981"
      successLight: "#D1FAE5"
      warning: "#F59E0B"
      warningLight: "#FEF3C7"
      error: "#EF4444"
      errorLight: "#FEE2E2"
      info: "#3B82F6"
      infoLight: "#DBEAFE"
    neutral:
      50: "#F8FAFC"
      100: "#F1F5F9"
      200: "#E2E8F0"
      400: "#94A3B8"
      500: "#64748B"
      900: "#0F172A"
      white: "#FFFFFF"
  typography:
    families:
      sans: "system-ui, -apple-system, sans-serif"
    sizes:
      caption: "11px"
      bodySmall: "12px"
      body: "14px"
      bodyLarge: "16px"
      h4: "18px"
      h3: "20px"
      h2: "24px"
      h1: "28px"
    weights:
      regular: 400
      medium: 500
      semibold: 600
      bold: 700
  spacing:
    xs: "4px"
    sm: "8px"
    md: "12px"
    base: "16px"
    lg: "20px"
    xl: "24px"
    2xl: "32px"
    3xl: "40px"
    4xl: "48px"
    5xl: "64px"
  radii:
    sm: "6px"
    md: "10px"
    lg: "14px"
    xl: "18px"
    full: "9999px"
  shadows:
    sm: "0 1px 2px rgba(0, 0, 0, 0.05)"
    md: "0 2px 6px rgba(0, 0, 0, 0.08)"
    lg: "0 4px 12px rgba(0, 0, 0, 0.12)"
---

# Rent A Room / RoomRent System Design

This document details the visual identity and design system for the Sub-leasing Management Ecosystem (SME), encompassing both the React Native Mobile App (for Tenants and On-site Managers) and the React/Vite Web Admin Portal (for Property Owners/Investors).

## Visual Identity

The product adopts a clean, modern, and professional aesthetic designed to convey trust, clarity, and ease of use. It balances the serious nature of property and financial management with an approachable, mobile-first friendliness.

- **Primary Motif**: The core brand color is a vibrant yet grounded Indigo (`#4F46E5`). This color acts as the primary anchor for actions, active states, and core branding, conveying stability and professionalism.
- **Accent Motif**: Cyan (`#06B6D4`) is utilized sparingly to draw attention to secondary actions or to inject a sense of modern digital flair against the more traditional Indigo.
- **Backgrounds & Surfaces**: The application heavily relies on soft, neutral Slate tones (`#F8FAFC` for backgrounds, white for surfaces) to create a spacious and uncluttered environment. This "clean slate" approach ensures that data (like financial metrics and room statuses) remains the focal point.

## UI Elements & Component Styles

### Cards & Surfaces
Information is primarily organized using a card-based layout. Cards utilize a crisp white background (`#FFFFFF`), a subtle border (`#F1F5F9` or `#E2E8F0`), and a light shadow (`shadow-sm`) to lift them slightly off the slate background. This subtle elevation establishes a clear visual hierarchy without overwhelming the user.

### Interactive Elements
- **Primary Buttons**: Solid Indigo (`#4F46E5`) with white text and medium font weight. On hover/press, they transition smoothly to a deeper Indigo (`#4338CA`) and feature a focus ring for accessibility.
- **Secondary Buttons**: White background with a slate border (`#E2E8F0`) and slate text. They provide a clear alternative to primary actions without competing for attention.
- **Inputs & Forms**: Form fields feature a clean, minimalist design with a soft slate border that transitions to the primary Indigo on focus, providing clear, immediate feedback to the user.

### Semantic Status Indicators
The system uses a highly consistent semantic color language to denote the status of properties, rooms, and contracts, ensuring instant recognition:
- **Available / Active**: Emerald Green (`#10B981`) combined with a soft green background (`#D1FAE5`) signifies positive states (e.g., room is empty, contract is active).
- **Occupied / Info**: Blue (`#3B82F6`) is used for informational states, such as a room currently being rented.
- **Maintenance / Pending**: Amber (`#F59E0B`) with a soft amber background indicates states requiring attention or waiting for user action (e.g., room under maintenance, tenant pending OTP activation).
- **Error / Destructive**: Red (`#EF4444`) is reserved for critical alerts or destructive actions (e.g., deleting a property).

## Typography
The system uses native system fonts to ensure maximum performance and native-feeling legibility across all platforms (iOS, Android, and Web). The typographic scale is tightly controlled, utilizing a robust hierarchy of weights—from `400` (regular) for body text to `700` (bold) for prominent data points and section headers. 

## Spacing & Layout
The layout strictly adheres to a 4-point grid system. This ensures a rhythmic, predictable flow of elements down the page. Modals and floating elements maintain generous padding (`24px` to `32px`) to ensure content never feels cramped, while tighter spacing (`4px` to `8px`) is used to group related micro-data (like an icon next to a label).

## Cross-Platform Consistency
Both the Mobile App and the Web Portal share these exact design tokens. A button on the mobile app will feel visually identical in purpose and weight to a button on the web admin dashboard, ensuring a seamless experience for users who interact with multiple facets of the ecosystem.
