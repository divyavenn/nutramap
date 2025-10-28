# Styled Components Migration Guide

## What We've Done

✅ **Installed styled-components**
```bash
npm install styled-components
npm install --save-dev @types/styled-components
```

✅ **Converted EditIngredient to use styled-components**
- Created `EditIngredient.styled.ts` with all component styles
- Updated `EditIngredient.tsx` to use styled components
- Removed dependency on `edit_ingredient.css`
- Only imports `variables.css` for CSS custom properties

## Benefits

### 1. **No More Style Conflicts**
Styled-components are scoped to the component automatically:
```tsx
// Each component gets unique class names like:
// EditIngredient__FormContainer-sc-1a2b3c4
// This prevents any cross-contamination
```

### 2. **Type Safety**
Props are typed and checked at compile time:
```tsx
interface FormContainerProps {
  $submitting?: boolean;
  $deleting?: boolean;
}

export const FormContainer = styled.form<FormContainerProps>`
  ${props => props.$submitting && css`
    pointer-events: none;
  `}
`;
```

### 3. **Dynamic Styling**
Easily change styles based on props:
```tsx
<S.FormContainer $submitting={isSubmitting} $deleting={isDeleting}>
```

### 4. **Co-location**
Styles live next to the component they style, making it easier to understand and maintain.

### 5. **NoClassName Collisions**
No need to worry about class naming conventions (BEM, etc.)

## Pattern to Follow

### File Structure
```
components/
├── MyComponent.tsx          # React component
├── MyComponent.styled.ts    # Styled components
└── ...
```

### Styled Components File Template
```typescript
import styled, { keyframes, css } from 'styled-components';

// 1. Define keyframes if needed
const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// 2. Define prop interfaces (use $ prefix for transient props)
interface ContainerProps {
  $active?: boolean;
  $variant?: 'primary' | 'secondary';
}

// 3. Export styled components
export const Container = styled.div<ContainerProps>`
  // Static styles
  display: flex;
  padding: 20px;

  // Dynamic styles based on props
  ${props => props.$active && css`
    background: var(--purple);
  `}

  // Animation
  animation: ${fadeIn} 0.3s ease;
`;
```

### Component File Template
```typescript
import React from 'react';
import '../assets/css/variables.css'; // Only import variables
import * as S from './MyComponent.styled';

interface Props {
  // Your component props
}

export function MyComponent({ }: Props) {
  return (
    <S.Container $active={true}>
      <S.Title>Hello</S.Title>
    </S.Container>
  );
}
```

## Migration Checklist for Other Components

### For Each Component:

1. **Create `ComponentName.styled.ts`**
   - Copy relevant styles from CSS file
   - Convert to styled-components syntax
   - Use CSS variables from `variables.css`
   - Use `$` prefix for transient props (props not passed to DOM)

2. **Update `ComponentName.tsx`**
   - Replace CSS import with variables.css
   - Add: `import * as S from './ComponentName.styled'`
   - Replace `className` attributes with styled components
   - Pass dynamic props with `$` prefix

3. **Test the component**
   - Verify styling looks the same
   - Check responsive behavior
   - Test hover/active states

4. **Remove old CSS** (optional)
   - Once all components using the CSS file are migrated
   - Keep only `variables.css`

## Components to Migrate (Priority Order)

1. ✅ **EditIngredient** - DONE
2. **EditLogForm** - High priority (shares class names)
3. **MealEdit** - High priority (shares class names)
4. **RecipeCard** - Medium priority
5. **RecipeBlurb** - Medium priority
6. **Logs** - Medium priority
7. **NewLog** - Low priority
8. **NewFood** - Low priority
9. Other components as needed

## CSS Variables to Keep

Keep all variables in `variables.css`:
- Colors: `--white`, `--purple`, `--red`, etc.
- Sizes: `--modal-width`, `--dashboard-width`, etc.
- Font sizes: `--inconsolata-font-size`, etc.

Access them in styled-components:
```typescript
export const Text = styled.span`
  color: var(--white);
  font-size: var(--inconsolata-font-size);
`;
```

## Notes

- Use `$` prefix for props that shouldn't be passed to DOM elements
- Styled-components automatically handles vendor prefixes
- Keyframe animations are component-scoped
- CSS custom properties (variables) still work great with styled-components
