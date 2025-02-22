import React, { useContext, useMemo } from 'react';
import { View } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import { MetricsData } from './metricsTypes';
import { cardStyles } from './MetricsTab';
import { useTranslation } from 'react-i18next';
import {
  getFootprintForMetrics,
  getHighestFootprint,
  getHighestFootprintForDistance,
} from './footprintHelper';
import {
  formatDateRangeOfDays,
  parseDataFromMetrics,
  generateSummaryFromData,
  calculatePercentChange,
  segmentDaysByWeeks,
  MetricsSummary,
} from './metricsHelper';
import { logDebug, logWarn } from '../plugin/logger';
import TimelineContext from '../TimelineContext';
import { isoDatesDifference } from '../diary/timelineHelper';
import useAppConfig from '../useAppConfig';

type Props = { userMetrics?: MetricsData; aggMetrics?: MetricsData };
const CarbonTextCard = ({ userMetrics, aggMetrics }: Props) => {
  const { colors } = useTheme();
  const { dateRange } = useContext(TimelineContext);
  const { t } = useTranslation();
  const appConfig = useAppConfig();
  // Whether to show the uncertainty on the carbon footprint charts, default: true
  const showUnlabeledMetrics =
    appConfig?.metrics?.phone_dashboard_ui?.footprint_options?.unlabeled_uncertainty ?? true;

  const userText = useMemo(() => {
    if (userMetrics?.distance?.length) {
      //separate data into weeks
      const [thisWeekDistance, lastWeekDistance] = segmentDaysByWeeks(
        userMetrics?.distance,
        dateRange[1],
      );

      //formatted data from last week, if exists (14 days ago -> 8 days ago)
      let userLastWeekModeMap = {};
      let userLastWeekSummaryMap = {};
      if (lastWeekDistance && isoDatesDifference(dateRange[0], lastWeekDistance[0].date) >= 0) {
        userLastWeekModeMap = parseDataFromMetrics(lastWeekDistance, 'user');
        userLastWeekSummaryMap = generateSummaryFromData(userLastWeekModeMap, 'distance');
      }

      //formatted distance data from this week (7 days ago -> yesterday)
      let userThisWeekModeMap = parseDataFromMetrics(thisWeekDistance, 'user');
      let userThisWeekSummaryMap = generateSummaryFromData(userThisWeekModeMap, 'distance');
      let worstDistance = userThisWeekSummaryMap.reduce(
        (prevDistance, currModeSummary) => prevDistance + currModeSummary.values,
        0,
      );

      //setting up data to be displayed
      let textList: { label: string; value: string }[] = [];

      //calculate low-high and format range for prev week, if exists (14 days ago -> 8 days ago)
      if (userLastWeekSummaryMap[0]) {
        let userPrevWeek = {
          low: getFootprintForMetrics(userLastWeekSummaryMap, 0),
          high: getFootprintForMetrics(userLastWeekSummaryMap, getHighestFootprint()),
        };
        const label = `${t('main-metrics.prev-week')} (${formatDateRangeOfDays(lastWeekDistance)})`;
        if (userPrevWeek.low == userPrevWeek.high)
          textList.push({ label: label, value: `${Math.round(userPrevWeek.low)}` });
        else
          textList.push({
            label: label + '²',
            value: `${Math.round(userPrevWeek.low)} - ${Math.round(userPrevWeek.high)}`,
          });
      }

      //calculate low-high and format range for past week (7 days ago -> yesterday)
      let userPastWeek = {
        low: getFootprintForMetrics(userThisWeekSummaryMap, 0),
        high: getFootprintForMetrics(userThisWeekSummaryMap, getHighestFootprint()),
      };
      const label = `${t('main-metrics.past-week')} (${formatDateRangeOfDays(thisWeekDistance)})`;
      if (userPastWeek.low == userPastWeek.high)
        textList.push({ label: label, value: `${Math.round(userPastWeek.low)}` });
      else
        textList.push({
          label: label + '²',
          value: `${Math.round(userPastWeek.low)} - ${Math.round(userPastWeek.high)}`,
        });

      //calculate worst-case carbon footprint
      let worstCarbon = getHighestFootprintForDistance(worstDistance);
      textList.push({ label: t('main-metrics.worst-case'), value: `${Math.round(worstCarbon)}` });

      return textList;
    }
  }, [userMetrics]);

  const groupText = useMemo(() => {
    if (aggMetrics?.distance?.length) {
      //separate data into weeks
      const thisWeekDistance = segmentDaysByWeeks(aggMetrics?.distance, dateRange[1])[0];

      let aggThisWeekModeMap = parseDataFromMetrics(thisWeekDistance, 'aggregate');
      let aggThisWeekSummary = generateSummaryFromData(aggThisWeekModeMap, 'distance');

      // Issue 422:
      // https://github.com/e-mission/e-mission-docs/issues/422
      let aggCarbonData: MetricsSummary[] = aggThisWeekSummary.map((summaryEntry) => {
        if (isNaN(summaryEntry.values)) {
          logWarn(`WARNING in calculating groupCarbonRecords: value is NaN for mode 
            ${summaryEntry.key}, changing to 0`);
          summaryEntry.values = 0;
        }
        return summaryEntry;
      });

      let groupText: { label: string; value: string }[] = [];

      let aggCarbon = {
        low: getFootprintForMetrics(aggCarbonData, 0),
        high: getFootprintForMetrics(aggCarbonData, getHighestFootprint()),
      };
      logDebug(`groupText: aggCarbon = ${JSON.stringify(aggCarbon)}`);
      const label = t('main-metrics.average');
      if (aggCarbon.low == aggCarbon.high)
        groupText.push({ label: label, value: `${Math.round(aggCarbon.low)}` });
      else
        groupText.push({
          label: label + '²',
          value: `${Math.round(aggCarbon.low)} - ${Math.round(aggCarbon.high)}`,
        });

      return groupText;
    }
  }, [aggMetrics]);

  const textEntries = useMemo(() => {
    let tempText: { label: string; value: string }[] = [];
    if (userText?.length) {
      tempText = tempText.concat(userText);
    }
    if (groupText?.length) {
      tempText = tempText.concat(groupText);
    }
    return tempText;
  }, [userText, groupText]);

  const cardSubtitleText = useMemo(() => {
    if (!aggMetrics?.distance?.length) return;
    const recentEntries = segmentDaysByWeeks(aggMetrics?.distance, dateRange[1])
      .slice(0, 2)
      .reverse()
      .flat();
    const recentEntriesRange = formatDateRangeOfDays(recentEntries);
    return `${t('main-metrics.estimated-emissions')}, (${recentEntriesRange})`;
  }, [aggMetrics?.distance]);

  return (
    <Card style={cardStyles.card} contentStyle={{ flex: 1 }}>
      <Card.Title
        title={t('main-metrics.footprint')}
        titleVariant="titleLarge"
        titleStyle={cardStyles.titleText(colors)}
        subtitle={cardSubtitleText}
        subtitleStyle={[cardStyles.titleText(colors), cardStyles.subtitleText]}
        style={cardStyles.title(colors)}
      />
      <Card.Content style={cardStyles.content}>
        {textEntries?.length > 0 &&
          Object.keys(textEntries).map((i) => (
            <View
              key={textEntries[i].label}
              style={{
                paddingHorizontal: 15,
                flexDirection: 'row',
                justifyContent: 'space-between',
              }}>
              <Text variant="titleSmall">{textEntries[i].label}</Text>
              <Text>{textEntries[i].value + ' ' + 'kg CO₂'}</Text>
            </View>
          ))}
        {showUnlabeledMetrics && (
          <Text
            variant="labelSmall"
            style={{ textAlign: 'left', fontWeight: '400', marginTop: 'auto', paddingTop: 10 }}>
            {t('main-metrics.range-uncertain-footnote')}
          </Text>
        )}
      </Card.Content>
    </Card>
  );
};

export default CarbonTextCard;
