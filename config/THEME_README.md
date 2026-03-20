# 🎨 SGN Branding & Theme Configuration

Documentation complète des tokens et thèmes intégrés au projet.

---

## 📋 Structure

- **`theme.ts`** - Configuration des thèmes dark/light avec tokens
- **`globals.css`** - CSS variables pour accès direct
- **`hero.ts`** - Plugin HeroUI avec thèmes SGN
- **`providers.tsx`** - Configuration next-themes

---

## 🎯 Utilisation

### 1. **HeroUI Components (automatique)**

Tous les composants HeroUI utilisent automatiquement les couleurs SGN :

```tsx
import { Button, Card } from "@heroui/react";

export default function Example() {
  return (
    <div>
      <Button color="primary">Action SGN</Button>
      <Button color="success">Succès</Button>
      <Button color="warning">Attention</Button>
      <Button color="danger">Erreur</Button>
    </div>
  );
}
```

### 2. **TypeScript - Configuration Importée**

```tsx
import { sgnTheme, sgnBrand, sgnSemantic } from "@/config/theme";

export function MyComponent() {
  return (
    <div style={{ color: sgnTheme.dark.colors.primary }}>
      Texte avec couleur marque
    </div>
  );
}
```

### 3. **CSS Classes (Tailwind)**

```tsx
<div className="bg-primary text-foreground border-divider">
  Conteneur avec couleurs du thème courant
</div>
```

### 4. **CSS Variables (Direct)**

```css
.custom-element {
  background-color: var(--sgn-primary);
  color: var(--sgn-dark-text);
  border: 1px solid var(--sgn-border-dark);
}
```

---

## 🌙 Thèmes Disponibles

### Dark Theme (par défaut)

| Token        | Valeur    |
| ------------ | --------- |
| `background` | `#212530` |
| `foreground` | `#FFFFFF` |
| `primary`    | `#E56F0B` |
| `success`    | `#549B33` |
| `warning`    | `#CBBD25` |
| `error`      | `#CD3333` |
| `info`       | `#3299CC` |

### Light Theme

| Token        | Valeur    |
| ------------ | --------- |
| `background` | `#FFFFFF` |
| `foreground` | `#212530` |
| `primary`    | `#E56F0B` |
| `success`    | `#40732E` |
| `warning`    | `#D7C929` |
| `error`      | `#9C2727` |
| `info`       | `#29749C` |

---

## 🔧 Changer de Thème

Via le composant `theme-switch.tsx` (déjà intégré) ou en code :

```tsx
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      Changer de thème
    </button>
  );
}
```

---

## 🎨 Palette Marque (toujours disponible)

```tsx
import { sgnBrand } from "@/config/theme";

export function Hero() {
  return <div style={{ background: sgnBrand.gradient }}>Dégradé de marque</div>;
}
```

---

## ✅ Points Importants

- ✓ **Automatique** - HeroUI components prennent les couleurs immédiatement
- ✓ **Persistent** - Le thème est sauvegardé en localStorage
- ✓ **Accessible** - Contraste texte/fond respecte AAA
- ✓ **Brand First** - Orange SGN réservé aux actions clés (CTA)
- ✓ **CSS Variables** - Disponibles pour cas spécialisés

---

## 🔗 Fichiers Modifiés

- [hero.ts](../hero.ts) - Configuration HeroUI
- [styles/globals.css](../styles/globals.css) - CSS variables
- [config/theme.ts](./theme.ts) - Token configuration
- [app/providers.tsx](../app/providers.tsx) - Theme provider setup
