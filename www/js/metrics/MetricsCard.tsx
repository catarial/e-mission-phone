import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Card, Checkbox, Text, useTheme } from 'react-native-paper';
import colorLib from 'color';
import BarChart from '../components/BarChart';
import { DayOfMetricData } from './metricsTypes';
import {
  formatDateRangeOfDays,
  getLabelsForDay,
  tsForDayOfMetricData,
  getUniqueLabelsForDays,
  valueForFieldOnDay,
  getUnitUtilsForMetric,
} from './metricsHelper';
import ToggleSwitch from '../components/ToggleSwitch';
import { cardStyles } from './MetricsTab';
import { labelKeyToRichMode, labelOptions } from '../survey/multilabel/confirmHelper';
import { getBaseModeByText } from '../diary/diaryHelper';
import { useTranslation } from 'react-i18next';
import { GroupingField, MetricName } from '../types/appConfigTypes';
import { useImperialConfig } from '../config/useImperialConfig';
import { base_modes } from 'e-mission-common';

type Props = {
  metricName: MetricName;
  groupingFields: GroupingField[];
  cardTitle: string;
  userMetricsDays?: DayOfMetricData[];
  aggMetricsDays?: DayOfMetricData[];
};
const MetricsCard = ({
  metricName,
  groupingFields,
  cardTitle,
  userMetricsDays,
  aggMetricsDays,
}: Props) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const imperialConfig = useImperialConfig();
  const [viewMode, setViewMode] = useState<'details' | 'graph'>('details');
  const [populationMode, setPopulationMode] = useState<'user' | 'aggregate'>('user');
  const [graphIsStacked, setGraphIsStacked] = useState(true);
  const metricDataDays = useMemo(
    () => (populationMode == 'user' ? userMetricsDays : aggMetricsDays),
    [populationMode, userMetricsDays, aggMetricsDays],
  );

  const [axisUnits, unitConvertFn, unitDisplayFn] = useMemo(
    () => getUnitUtilsForMetric(metricName, imperialConfig),
    [metricName],
  );

  // for each label on each day, create a record for the chart
  const chartData = useMemo(() => {
    if (!metricDataDays || viewMode != 'graph') return [];
    const records: { label: string; x: string | number; y: string | number }[] = [];
    metricDataDays.forEach((day) => {
      const labels = getLabelsForDay(day);
      labels.forEach((label) => {
        const rawVal = valueForFieldOnDay(day, groupingFields[0], label);
        if (rawVal) {
          records.push({
            label: labelKeyToRichMode(label),
            x: unitConvertFn(rawVal),
            y: tsForDayOfMetricData(day) * 1000, // time (as milliseconds) will go on Y axis because it will be a horizontal chart
          });
        }
      });
    });
    // sort records (affects the order they appear in the chart legend)
    records.sort((a, b) => {
      if (a.label == 'Unlabeled') return 1; // sort Unlabeled to the end
      if (b.label == 'Unlabeled') return -1; // sort Unlabeled to the end
      return (a.y as number) - (b.y as number); // otherwise, just sort by time
    });
    return records;
  }, [metricDataDays, viewMode]);

  const cardSubtitleText = useMemo(() => {
    if (!metricDataDays) return;
    const groupText =
      populationMode == 'user' ? t('main-metrics.user-totals') : t('main-metrics.group-totals');
    return `${groupText} (${formatDateRangeOfDays(metricDataDays)})`;
  }, [metricDataDays, populationMode]);

  // for each label, sum up cumulative values across all days
  const metricSumValues = useMemo(() => {
    if (!metricDataDays || viewMode != 'details') return [];
    const uniqueLabels = getUniqueLabelsForDays(metricDataDays);

    // for each label, sum up cumulative values across all days
    const vals = {};
    uniqueLabels.forEach((label) => {
      const sum: any = metricDataDays.reduce<number | Object>((acc, day) => {
        const val = valueForFieldOnDay(day, groupingFields[0], label);
        // if val is number, add it to the accumulator
        if (!isNaN(val)) {
          return acc + val;
        } else if (val && typeof val == 'object') {
          // if val is object, add its values to the accumulator's values
          acc = acc || {};
          for (let key in val) {
            acc[key] = (acc[key] || 0) + val[key];
          }
          return acc;
        }
        return acc;
      }, 0);
      vals[label] = unitDisplayFn(sum);
    });
    return vals;
  }, [metricDataDays, viewMode]);

  // Unlabelled data shows up as 'UNKNOWN' grey and mostly transparent
  // All other modes are colored according to their base mode
  const getColorForLabel = (label: string) => {
    if (label == 'Unlabeled') {
      const unknownModeColor = base_modes.get_base_mode_by_key('UNKNOWN').color;
      return colorLib(unknownModeColor).alpha(0.15).rgb().string();
    }
    return getBaseModeByText(label, labelOptions).color;
  };

  return (
    <Card style={cardStyles.card} contentStyle={{ flex: 1 }}>
      <Card.Title
        title={cardTitle}
        titleVariant="titleLarge"
        titleStyle={cardStyles.titleText(colors)}
        subtitle={cardSubtitleText}
        subtitleStyle={[cardStyles.titleText(colors), cardStyles.subtitleText]}
        right={() => (
          <View style={{ gap: 3 }}>
            <ToggleSwitch
              density="high"
              value={viewMode}
              onValueChange={(v) => setViewMode(v as any)}
              buttons={[
                { icon: 'abacus', value: 'details' },
                { icon: 'chart-bar', value: 'graph' },
              ]}
            />
            <ToggleSwitch
              density="high"
              value={populationMode}
              onValueChange={(p) => setPopulationMode(p as any)}
              buttons={[
                { icon: 'account', value: 'user' },
                { icon: 'account-group', value: 'aggregate' },
              ]}
            />
          </View>
        )}
        style={cardStyles.title(colors)}
      />
      <Card.Content style={cardStyles.content}>
        {viewMode == 'details' &&
          (Object.keys(metricSumValues).length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {Object.keys(metricSumValues).map((label, i) => (
                <View style={{ width: '50%', paddingHorizontal: 8 }} key={i}>
                  <Text variant="titleSmall">{labelKeyToRichMode(label)}</Text>
                  <Text>{metricSumValues[label]}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text variant="labelMedium" style={{ textAlign: 'center', margin: 'auto' }}>
              {t('metrics.chart-no-data')}
            </Text>
          ))}
        {viewMode == 'graph' &&
          (chartData.length ? (
            <>
              <BarChart
                records={chartData}
                axisTitle={axisUnits}
                isHorizontal={true}
                timeAxis={true}
                stacked={graphIsStacked}
                getColorForLabel={getColorForLabel}
              />
              <View
                style={{
                  flexDirection: 'row',
                  height: 10,
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                }}>
                <Text variant="labelMedium">Stack bars:</Text>
                <Checkbox
                  status={graphIsStacked ? 'checked' : 'unchecked'}
                  onPress={() => setGraphIsStacked(!graphIsStacked)}
                />
              </View>
            </>
          ) : (
            <Text variant="labelMedium" style={{ textAlign: 'center', margin: 'auto' }}>
              {t('metrics.chart-no-data')}
            </Text>
          ))}
      </Card.Content>
    </Card>
  );
};

export default MetricsCard;
