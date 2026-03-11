declare module 'recharts' {
  import { ComponentType, SVGProps, ReactNode } from 'react';

  export interface ResponsiveContainerProps {
    width?: string | number;
    height?: string | number;
    children?: ReactNode;
  }

  export interface CartesianGridProps {
    strokeDasharray?: string;
    stroke?: string;
    vertical?: boolean;
  }

  export interface XAxisProps {
    dataKey?: string;
    stroke?: string;
    tick?: any;
    tickLine?: boolean;
    tickMargin?: number;
    axisLine?: boolean;
    tickFormatter?: (value: any) => string;
    type?: 'number' | 'category';
    hide?: boolean;
  }

  export interface YAxisProps {
    stroke?: string;
    tick?: any;
    allowDecimals?: boolean;
    tickLine?: boolean;
    axisLine?: boolean;
    dataKey?: string;
    type?: 'number' | 'category';
    tickMargin?: number;
    width?: number;
  }

  export interface TooltipProps {
    contentStyle?: React.CSSProperties;
    labelStyle?: React.CSSProperties;
    itemStyle?: React.CSSProperties;
    formatter?: (value: any, name: string) => [string, string];
    cursor?: any;
    content?: ReactNode;
    active?: boolean;
    payload?: any[];
    label?: any;
  }

  export interface LegendProps {
    payload?: any[];
    verticalAlign?: 'top' | 'bottom' | 'middle';
    content?: ReactNode;
  }

  export interface BarProps {
    dataKey: string;
    fill?: string;
    radius?: number | [number, number, number, number];
    animationDuration?: number;
    layout?: 'horizontal' | 'vertical';
  }

  export interface BarChartProps {
    data?: any[];
    margin?: { top?: number; right?: number; left?: number; bottom?: number };
    width?: number;
    height?: number;
    children?: ReactNode;
    accessibilityLayer?: boolean;
    layout?: 'horizontal' | 'vertical';
  }

  export const ResponsiveContainer: ComponentType<ResponsiveContainerProps>;
  export const CartesianGrid: ComponentType<CartesianGridProps>;
  export const XAxis: ComponentType<XAxisProps>;
  export const YAxis: ComponentType<YAxisProps>;
  export const Tooltip: ComponentType<TooltipProps>;
  export const Legend: ComponentType<LegendProps>;
  export const Bar: ComponentType<BarProps>;
  export const BarChart: ComponentType<BarChartProps>;
}
