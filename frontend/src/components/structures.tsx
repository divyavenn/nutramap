import { createContext } from 'react';

export interface LogComponent {
  food_id: number;
  food_name: string;
  amount: string;
  weight_in_grams: number;
}

export interface DisplayLogProps {
  food_name: string;
  date: Date;
  amount?: string;
  weight_in_grams: number;
}

export interface LogProps {
  _id: string;
  recipe_id?: string | null;
  recipe_name: string;
  servings: number;
  date: Date;
  components: LogComponent[];
  recipe_exists?: boolean;  // Whether the linked recipe still exists
}

export interface LogbookProps {
  logs: LogProps[];
  callAfterSubmitting: () => void;
  callToChangeDay: (date: Date) => void;
}

export interface KeyValue {
  id: number;
  name: string;
}

export interface Nutrient {
  name: string;
  target: number;
  shouldExceed: boolean;
}

export interface NutrientStatsProps {
  name: string;
  target: number;
  dayIntake?: number;
  avgIntake: number;
  shouldExceed: boolean;
  units: string;
}

// Exporting RangeType directly
export enum RangeType {
  default,
  custom
}

export class TimePeriod {
  public start: Date;
  public end: Date;

  constructor(start: Date, end: Date) {
    if (start > end) {
      throw new Error("startDate must be before or equal to endDate.");
    }
    this.start = new Date(start);
    this.start.setHours(0, 0, 0, 0);

    this.end = new Date(end);
    this.end.setHours(23, 59, 59, 999);
  }
}

export interface DateSelectorProps {
  startDate: Date;
  endDate: Date;
  rangeType: RangeType;
  setRangeType: (r: RangeType) => void;
  onDateChange: (range: TimePeriod) => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
}

export const getCurrentPeriod = () => {
  const now = new Date();
  return new TimePeriod(
    new Date(now.getFullYear(), now.getMonth(), 1),
    new Date(now.getFullYear(), now.getMonth() + 1, 0)
  );
};

// Fixing initial value for currentDate in context
export const CurrentDateContext = createContext({
  currentDate: new Date(),
  setCurrentDate: (date: Date) => {}
});