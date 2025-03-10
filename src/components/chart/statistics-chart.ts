import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import type {
  BarSeriesOption,
  LineSeriesOption,
} from "echarts/types/dist/shared";
import { styleMap } from "lit/directives/style-map";
import { getGraphColorByIndex } from "../../common/color/colors";
import { isComponentLoaded } from "../../common/config/is_component_loaded";

import type {
  Statistics,
  StatisticsMetaData,
  StatisticType,
} from "../../data/recorder";
import {
  getDisplayUnit,
  getStatisticLabel,
  getStatisticMetadata,
  statisticsHaveType,
} from "../../data/recorder";
import type { HomeAssistant } from "../../types";
import "./ha-chart-base";
import { computeRTL } from "../../common/util/compute_rtl";
import type { ECOption } from "../../resources/echarts";
import {
  formatNumber,
  getNumberFormatOptions,
} from "../../common/number/format_number";
import { formatDateTimeWithSeconds } from "../../common/datetime/format_date_time";
import { getTimeAxisLabelConfig } from "./axis-label";

export const supportedStatTypeMap: Record<StatisticType, StatisticType> = {
  mean: "mean",
  min: "min",
  max: "max",
  sum: "sum",
  state: "sum",
  change: "sum",
};

@customElement("statistics-chart")
export class StatisticsChart extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public statisticsData?: Statistics;

  @property({ attribute: false }) public metadata?: Record<
    string,
    StatisticsMetaData
  >;

  @property({ attribute: false }) public names?: Record<string, string>;

  @property() public unit?: string;

  @property({ attribute: false }) public endTime?: Date;

  @property({ attribute: false, type: Array })
  public statTypes: StatisticType[] = ["sum", "min", "mean", "max"];

  @property({ attribute: false }) public chartType: "line" | "bar" = "line";

  @property({ attribute: false, type: Number }) public minYAxis?: number;

  @property({ attribute: false, type: Number }) public maxYAxis?: number;

  @property({ attribute: "fit-y-data", type: Boolean }) public fitYData = false;

  @property({ attribute: "hide-legend", type: Boolean }) public hideLegend =
    false;

  @property({ attribute: "logarithmic-scale", type: Boolean })
  public logarithmicScale = false;

  @property({ attribute: "is-loading-data", type: Boolean })
  public isLoadingData = false;

  @property({ attribute: "click-for-more-info", type: Boolean })
  public clickForMoreInfo = true;

  @property() public period?: string;

  @property({ attribute: "days-to-show", type: Number })
  public daysToShow?: number;

  @property({ type: String }) public height?: string;

  @state() private _chartData: (LineSeriesOption | BarSeriesOption)[] = [];

  @state() private _legendData: string[] = [];

  @state() private _statisticIds: string[] = [];

  @state() private _chartOptions?: ECOption;

  @state() private _hiddenStats = new Set<string>();

  private _computedStyle?: CSSStyleDeclaration;

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    return changedProps.size > 1 || !changedProps.has("hass");
  }

  public willUpdate(changedProps: PropertyValues) {
    if (
      changedProps.has("statisticsData") ||
      changedProps.has("statTypes") ||
      changedProps.has("chartType") ||
      changedProps.has("hideLegend") ||
      changedProps.has("_hiddenStats")
    ) {
      this._generateData();
    }
    if (
      !this.hasUpdated ||
      changedProps.has("unit") ||
      changedProps.has("period") ||
      changedProps.has("chartType") ||
      changedProps.has("minYAxis") ||
      changedProps.has("maxYAxis") ||
      changedProps.has("fitYData") ||
      changedProps.has("logarithmicScale") ||
      changedProps.has("hideLegend") ||
      changedProps.has("_legendData")
    ) {
      this._createOptions();
    }
  }

  public firstUpdated() {
    this._computedStyle = getComputedStyle(this);
  }

  protected render(): TemplateResult {
    if (!isComponentLoaded(this.hass, "history")) {
      return html`<div class="info">
        ${this.hass.localize("ui.components.history_charts.history_disabled")}
      </div>`;
    }

    if (this.isLoadingData && !this.statisticsData) {
      return html`<div class="info">
        ${this.hass.localize(
          "ui.components.statistics_charts.loading_statistics"
        )}
      </div>`;
    }

    if (!this.statisticsData || !Object.keys(this.statisticsData).length) {
      return html`<div class="info">
        ${this.hass.localize(
          "ui.components.statistics_charts.no_statistics_found"
        )}
      </div>`;
    }

    return html`
      <ha-chart-base
        .hass=${this.hass}
        .data=${this._chartData}
        .options=${this._chartOptions}
        .height=${this.height}
        style=${styleMap({ height: this.height })}
        external-hidden
        @dataset-hidden=${this._datasetHidden}
        @dataset-unhidden=${this._datasetUnhidden}
      ></ha-chart-base>
    `;
  }

  private _datasetHidden(ev: CustomEvent) {
    this._hiddenStats.add(ev.detail.name);
    this.requestUpdate("_hiddenStats");
  }

  private _datasetUnhidden(ev: CustomEvent) {
    this._hiddenStats.delete(ev.detail.name);
    this.requestUpdate("_hiddenStats");
  }

  private _renderTooltip(params: any) {
    return params
      .map((param, index: number) => {
        const value = `${formatNumber(
          // max series has 3 values, as the second value is the max-min to form a band
          (param.value[2] ?? param.value[1]) as number,
          this.hass.locale,
          getNumberFormatOptions(
            undefined,
            this.hass.entities[this._statisticIds[param.seriesIndex]]
          )
        )} ${this.unit}`;

        const time =
          index === 0
            ? formatDateTimeWithSeconds(
                new Date(param.value[0]),
                this.hass.locale,
                this.hass.config
              ) + "<br>"
            : "";
        return `${time}${param.marker} ${param.seriesName}: ${value}
      `;
      })
      .join("<br>");
  }

  private _createOptions() {
    const splitLineStyle = this.hass.themes?.darkMode ? { opacity: 0.15 } : {};
    const dayDifference = this.daysToShow ?? 1;
    this._chartOptions = {
      xAxis: {
        type: "time",
        axisLabel: getTimeAxisLabelConfig(
          this.hass.locale,
          this.hass.config,
          dayDifference
        ),
        axisLine: {
          show: false,
        },
        splitLine: {
          show: true,
          lineStyle: splitLineStyle,
        },
        minInterval:
          dayDifference >= 89 // quarter
            ? 28 * 3600 * 24 * 1000
            : dayDifference > 2
              ? 3600 * 24 * 1000
              : undefined,
      },
      yAxis: {
        type: this.logarithmicScale ? "log" : "value",
        name: this.unit,
        nameGap: 2,
        nameTextStyle: {
          align: "left",
        },
        position: computeRTL(this.hass) ? "right" : "left",
        // @ts-ignore
        scale: this.chartType !== "bar",
        min: this.fitYData ? undefined : this.minYAxis,
        max: this.fitYData ? undefined : this.maxYAxis,
        splitLine: {
          show: true,
          lineStyle: splitLineStyle,
        },
      },
      legend: {
        show: !this.hideLegend,
        icon: "circle",
        padding: [20, 0],
        data: this._legendData,
      },
      grid: {
        ...(this.hideLegend ? { top: this.unit ? 30 : 5 } : {}), // undefined is the same as 0
        left: 20,
        right: 1,
        bottom: 0,
        containLabel: true,
      },
      tooltip: {
        trigger: "axis",
        appendTo: document.body,
        formatter: this._renderTooltip.bind(this),
      },
    };
  }

  private _getStatisticsMetaData = memoizeOne(
    async (statisticIds: string[] | undefined) => {
      const statsMetadataArray = await getStatisticMetadata(
        this.hass,
        statisticIds
      );
      const statisticsMetaData = {};
      statsMetadataArray.forEach((x) => {
        statisticsMetaData[x.statistic_id] = x;
      });
      return statisticsMetaData;
    }
  );

  private async _generateData() {
    if (!this.statisticsData) {
      return;
    }

    const statisticsMetaData =
      this.metadata ||
      (await this._getStatisticsMetaData(Object.keys(this.statisticsData)));

    let colorIndex = 0;
    const statisticsData = Object.entries(this.statisticsData);
    const totalDataSets: typeof this._chartData = [];
    const legendData: { name: string; color: string }[] = [];
    const statisticIds: string[] = [];
    let endTime: Date;

    if (statisticsData.length === 0) {
      return;
    }

    endTime =
      this.endTime ||
      // Get the highest date from the last date of each statistic
      new Date(
        Math.max(
          ...statisticsData.map(([_, stats]) =>
            new Date(stats[stats.length - 1].start).getTime()
          )
        )
      );

    if (endTime > new Date()) {
      endTime = new Date();
    }

    let unit: string | undefined | null;

    const names = this.names || {};
    statisticsData.forEach(([statistic_id, stats]) => {
      const meta = statisticsMetaData?.[statistic_id];
      let name = names[statistic_id];
      if (name === undefined) {
        name = getStatisticLabel(this.hass, statistic_id, meta);
      }

      if (!this.unit) {
        if (unit === undefined) {
          unit = getDisplayUnit(this.hass, statistic_id, meta);
        } else if (
          unit !== null &&
          unit !== getDisplayUnit(this.hass, statistic_id, meta)
        ) {
          // Clear unit if not all statistics have same unit
          unit = null;
        }
      }

      // array containing [value1, value2, etc]
      let prevValues: (number | null)[][] | null = null;
      let prevEndTime: Date | undefined;

      // The datasets for the current statistic
      const statDataSets: (LineSeriesOption | BarSeriesOption)[] = [];
      const statLegendData: { name: string; color: string }[] = [];

      const pushData = (
        start: Date,
        end: Date,
        dataValues: (number | null)[][]
      ) => {
        if (!dataValues.length) return;
        if (start > end) {
          // Drop data points that are after the requested endTime. This could happen if
          // endTime is "now" and client time is not in sync with server time.
          return;
        }
        statDataSets.forEach((d, i) => {
          if (
            this.chartType === "line" &&
            prevEndTime &&
            prevValues &&
            prevEndTime.getTime() !== start.getTime()
          ) {
            // if the end of the previous data doesn't match the start of the current data,
            // we have to draw a gap so add a value at the end time, and then an empty value.
            d.data!.push([prevEndTime, ...prevValues[i]!]);
            d.data!.push([prevEndTime, null]);
          }
          d.data!.push([start, ...dataValues[i]!]);
        });
        prevValues = dataValues;
        prevEndTime = end;
      };

      const color = getGraphColorByIndex(
        colorIndex,
        this._computedStyle || getComputedStyle(this)
      );
      colorIndex++;

      const statTypes: this["statTypes"] = [];

      const hasMean =
        this.statTypes.includes("mean") && statisticsHaveType(stats, "mean");
      const drawBands =
        hasMean ||
        (this.statTypes.includes("min") &&
          statisticsHaveType(stats, "min") &&
          this.statTypes.includes("max") &&
          statisticsHaveType(stats, "max"));

      const sortedTypes = drawBands
        ? [...this.statTypes].sort((a, b) => {
            if (a === "min" || b === "max") {
              return -1;
            }
            if (a === "max" || b === "min") {
              return +1;
            }
            return 0;
          })
        : this.statTypes;

      let displayedLegend = false;
      sortedTypes.forEach((type) => {
        if (statisticsHaveType(stats, type)) {
          const band = drawBands && (type === "min" || type === "max");
          if (!this.hideLegend) {
            const showLegend = hasMean
              ? type === "mean"
              : displayedLegend === false;
            if (showLegend) {
              statLegendData.push({ name, color });
            }
            displayedLegend = displayedLegend || showLegend;
          }
          statTypes.push(type);
          const series: LineSeriesOption | BarSeriesOption = {
            id: `${statistic_id}-${type}`,
            type: this.chartType,
            data: [],
            name: name
              ? `${name} (${this.hass.localize(
                  `ui.components.statistics_charts.statistic_types.${type}`
                )})`
              : this.hass.localize(
                  `ui.components.statistics_charts.statistic_types.${type}`
                ),
            symbol: "circle",
            symbolSize: 0,
            lineStyle: {
              width: 1.5,
            },
            color: band && hasMean ? color + "3F" : color,
          };
          if (band) {
            series.stack = "band";
            (series as LineSeriesOption).symbol = "none";
            (series as LineSeriesOption).lineStyle = {
              opacity: 0,
            };
            if (drawBands && type === "max") {
              (series as LineSeriesOption).areaStyle = {
                color: color + "3F",
              };
            }
          }
          statDataSets.push(series);
          statisticIds.push(statistic_id);
        }
      });

      let prevDate: Date | null = null;
      // Process chart data.
      let firstSum: number | null | undefined = null;
      stats.forEach((stat) => {
        const startDate = new Date(stat.start);
        if (prevDate === startDate) {
          return;
        }
        prevDate = startDate;
        const dataValues: (number | null)[][] = [];
        statTypes.forEach((type) => {
          const val: (number | null)[] = [];
          if (type === "sum") {
            if (firstSum === null || firstSum === undefined) {
              val.push(0);
              firstSum = stat.sum;
            } else {
              val.push((stat.sum || 0) - firstSum);
            }
          } else if (type === "max") {
            const max = stat.max || 0;
            val.push(max - (stat.min || 0));
            val.push(max);
          } else {
            val.push(stat[type] ?? null);
          }
          dataValues.push(val);
        });
        if (!this._hiddenStats.has(name)) {
          pushData(startDate, new Date(stat.end), dataValues);
        }
      });

      // Concat two arrays
      Array.prototype.push.apply(totalDataSets, statDataSets);
      Array.prototype.push.apply(legendData, statLegendData);
    });

    if (unit) {
      this.unit = unit;
    }

    legendData.forEach(({ name, color }) => {
      // Add an empty series for the legend
      totalDataSets.push({
        id: name + "-legend",
        name: name,
        color,
        type: this.chartType,
        data: [],
      });
    });

    this._chartData = totalDataSets;
    if (legendData.length !== this._legendData.length) {
      // only update the legend if it has changed or it will trigger options update
      this._legendData = legendData.map(({ name }) => name);
    }
    this._statisticIds = statisticIds;
  }

  static styles = css`
    :host {
      display: block;
      min-height: 60px;
    }
    .info {
      text-align: center;
      line-height: 60px;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "statistics-chart": StatisticsChart;
  }
}
