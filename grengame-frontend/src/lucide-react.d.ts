declare module 'lucide-react' {
  import { ComponentType, SVGProps } from 'react';

  export interface IconProps extends SVGProps<SVGSVGElement> {
    size?: number | string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
  }

  export type Icon = ComponentType<IconProps>;

  export const Users: Icon;
  export const Clock: Icon;
  export const Target: Icon;
  export const Award: Icon;
  export const TrendingUp: Icon;
  export const Calendar: Icon;
  export const Medal: Icon;
}
