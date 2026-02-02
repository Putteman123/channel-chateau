import { useColorScheme } from 'react-native';
import { lightColors, darkColors, ColorScheme } from '../theme/colors';

export function useTheme(): { colors: ColorScheme; isDark: boolean } {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
  };
}
