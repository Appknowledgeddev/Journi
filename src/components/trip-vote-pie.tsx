"use client";

import { ResponsivePie } from "@nivo/pie";
import styles from "@/components/app-page.module.css";
import type { VoteChartDatum } from "@/app/trips/[id]/trip-workspace-shared";

type TripVotePieProps = {
  title: string;
  caption: string;
  data: VoteChartDatum[];
  accent?: "blue" | "orange" | "purple" | "green";
  emptyLabel?: string;
};

const accentPalettes: Record<NonNullable<TripVotePieProps["accent"]>, string[]> = {
  blue: ["#2c94f5", "#6bb8ff", "#9ed4ff", "#d8ebff"],
  orange: ["#cf6d2e", "#ee965f", "#f5bc93", "#f9dfca"],
  purple: ["#7857d8", "#9b7dee", "#c2adf8", "#e4dcff"],
  green: ["#2c8b67", "#49b08a", "#85d0b5", "#d4f1e6"],
};

export function TripVotePie({
  title,
  caption,
  data,
  accent = "blue",
  emptyLabel = "No votes yet",
}: TripVotePieProps) {
  const totalVotes = data.reduce((sum, item) => sum + item.value, 0);
  const chartData = data.filter((item) => item.value > 0);
  const palette = accentPalettes[accent];

  return (
    <div className={styles.tripVotePieCard}>
      <div className={styles.tripVotePieHeader}>
        <span className={styles.tripFactLabel}>{title}</span>
        <strong>{totalVotes} total votes</strong>
        <p className={styles.muted}>{caption}</p>
      </div>

      <div className={styles.tripVotePieLayout}>
        <div className={styles.tripVotePieCanvas}>
          {chartData.length ? (
            <ResponsivePie
              data={chartData}
              margin={{ top: 12, right: 12, bottom: 12, left: 12 }}
              innerRadius={0.76}
              padAngle={1.8}
              cornerRadius={5}
              activeInnerRadiusOffset={2}
              activeOuterRadiusOffset={10}
              colors={palette}
              borderWidth={0}
              enableArcLabels={false}
              enableArcLinkLabels={false}
              isInteractive={true}
              animate={true}
              motionConfig="gentle"
              transitionMode="centerRadius"
              tooltip={({ datum }) => (
                <div className={styles.tripVotePieTooltip}>
                  <strong>{datum.label}</strong>
                  <span>{datum.value} votes</span>
                </div>
              )}
              theme={{
                tooltip: {
                  container: {
                    background: "#112640",
                    color: "#f8fafc",
                    borderRadius: 14,
                    boxShadow: "0 10px 30px rgba(17, 38, 64, 0.18)",
                    fontSize: 12,
                  },
                },
              }}
            />
          ) : (
            <div className={styles.tripVotePieEmpty}>
              <span>{emptyLabel}</span>
            </div>
          )}
        </div>

        <div className={styles.tripVotePieLegend}>
          {data.length ? (
            data.map((item, index) => {
              const percentage = totalVotes ? Math.round((item.value / totalVotes) * 100) : 0;

              return (
                <div key={item.id} className={styles.tripVotePieLegendItem}>
                  <span
                    className={styles.tripVotePieLegendSwatch}
                    style={{ backgroundColor: palette[index % palette.length] }}
                  />
                  <div className={styles.tripVotePieLegendCopy}>
                    <strong>{item.label}</strong>
                    <span>
                      {item.value} votes{item.value === 1 ? "" : "s"}{totalVotes ? ` • ${percentage}%` : ""}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className={styles.muted}>{emptyLabel}</p>
          )}
        </div>
      </div>
    </div>
  );
}
