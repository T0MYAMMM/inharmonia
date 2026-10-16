import type { ContentSource, Lesson } from '../content/types';
import { chartToLesson } from './compile';
import type { ChartView, ChordChart } from './types';

export const USER_CHART_VERSION = 1;

/** A chord chart as stored on this device: the chart as entered, and how it is viewed. */
export interface UserChart {
  id: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  /** "user" for charts made here; kept as written for imported ones. */
  source: ContentSource;
  chart: ChordChart;
  view: ChartView;
}

export function makeUserChart(
  id: string,
  chart: ChordChart,
  view: ChartView,
  now: number,
  source: ContentSource = { kind: 'user' },
): UserChart {
  return { id, version: USER_CHART_VERSION, createdAt: now, updatedAt: now, source, chart, view };
}

/** The lesson the player runs for a stored chart. */
export function userChartLesson(c: UserChart): Lesson {
  return chartToLesson(c.id, c.chart, c.view);
}
