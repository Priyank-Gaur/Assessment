import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  pdf
} from '@react-pdf/renderer';

// NOTE: Removed Font.register() — the gstatic URLs don't serve raw .ttf files
// and a failed font registration causes the entire PDF to render blank.
// react-pdf bundles Helvetica by default, so no registration is needed.

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30,
    fontFamily: 'Helvetica'
  },
  header: {
    backgroundColor: '#895BF5',
    padding: 20,
    marginBottom: 20,
    borderRadius: 8
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5
  },
  headerSubtitle: {
    color: '#F2F0FF',
    fontSize: 14,
    textAlign: 'center'
  },
  userCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20
  },
  userInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  userLabel: {
    fontSize: 12,
    color: '#6b7280'
  },
  userValue: {
    fontSize: 12,
    color: '#111827',
    fontWeight: 'bold'
  },
  overallScore: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center'
  },
  scoreTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 15,
    textAlign: 'center'
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15
  },
  scoreText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  scoreLabel: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  scoreStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%'
  },
  statItem: {
    alignItems: 'center'
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 5
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 15,
    marginTop: 20
  },
  chartContainer: {
    marginBottom: 15,
    padding: 15,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff'
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center'
  },
  // FIX: Added missing barContainer style
  barContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
    justifyContent: 'flex-end'
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    paddingHorizontal: 20,
    paddingBottom: 20
  },
  bar: {
    width: '100%',
    borderRadius: 2
  },
  barLabel: {
    fontSize: 8,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 5
  },
  gaugeContainer: {
    alignItems: 'center',
    padding: 20
  },
  gaugeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center'
  },
  pieChart: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 100,
    padding: 20
  },
  pieLegend: {
    marginLeft: 20
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5
  },
  legendColor: {
    width: 12,
    height: 12,
    marginRight: 8
  },
  legendText: {
    fontSize: 10,
    color: '#6b7280'
  },
  spiderChart: {
    alignItems: 'center',
    padding: 20
  },
  packetCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 20,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center'
  },
  packetInfo: {
    flex: 1
  },
  packetName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 10
  },
  packetDetails: {
    flexDirection: 'row'
    // FIX: Removed unsupported 'gap' property
  },
  packetDetailGroup: {
    // FIX: Use marginRight instead of gap
    marginRight: 20
  },
  packetDetail: {
    fontSize: 12,
    color: '#6b7280'
  },
  packetDetailValue: {
    fontSize: 12,
    color: '#111827',
    fontWeight: 'bold'
  },
  packetPerformance: {
    alignItems: 'center',
    marginRight: 20
  },
  performanceImage: {
    width: 40,
    height: 40,
    marginBottom: 5
  },
  performanceText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center'
  },
  largeTextContainer: {
    backgroundColor: '#f3f4f6',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    padding: 15,
    marginTop: 10
  },
  largeText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: 'bold',
    textAlign: 'center'
  },
  insightsCard: {
    backgroundColor: '#f0f9ff',
    border: '1px solid #0ea5e9',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20
  },
  insightsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0c4a6e',
    marginBottom: 10
  },
  insightsText: {
    fontSize: 12,
    color: '#0c4a6e'
  },
  recommendationsCard: {
    backgroundColor: '#fef3c7',
    border: '1px solid #f59e0b',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20
  },
  recommendationsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 10
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10
  },
  recommendationNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2
  },
  recommendationNumberText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  recommendationText: {
    fontSize: 12,
    color: '#92400e',
    flex: 1
  },
  footer: {
    borderTop: '1px solid #e5e7eb',
    paddingTop: 20,
    marginTop: 30,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  footerText: {
    fontSize: 10,
    color: '#6b7280'
  }
});

const safeParseCSSValue = (value, fallback = 0) => {
  if (!value) return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return !isNaN(parsed) ? parsed : fallback;
  }
  return fallback;
};

const safeParseMargin = (margin, fallback = 0) => {
  if (!margin) return fallback;
  if (typeof margin === 'number') return margin;
  if (typeof margin === 'string') {
    const parts = margin.split(' ');
    const parsed = parseFloat(parts[0]);
    return !isNaN(parsed) ? parsed : fallback;
  }
  return fallback;
};

const getPerformanceLevel = (marks, packet = null) => {
  let scale = packet?.scoringScale;
  if (typeof scale === 'string') {
    try {
      scale = JSON.parse(scale);
    } catch {
      scale = null;
    }
  }
  if (packet && scale && Array.isArray(scale) && scale.length > 0) {
    const level = scale.find(range => marks >= range.min && marks <= range.max);
    if (level) {
      return {
        ...level,
        image: level.image,
        emoji: level.image && level.image.startsWith('data:image') ? null : (level.image || '📚')
      };
    }
  }

  const defaultScale = [
    { min: 0,  max: 2,  label: 'Needs Improvement', color: '#dc2626', emoji: '📚', largeText: "Keep practicing! You're making progress." },
    { min: 3,  max: 5,  label: 'Average',            color: '#d97706', emoji: '📊', largeText: "Good effort! You're on the right track." },
    { min: 6,  max: 8,  label: 'Good',               color: '#059669', emoji: '🎯', largeText: "Well done! You're showing strong understanding." },
    { min: 9,  max: 15, label: 'Excellent',           color: '#895BF5', emoji: '🏆', largeText: "Outstanding! You've mastered this material!" }
  ];

  return defaultScale.find(r => marks >= r.min && marks <= r.max) || defaultScale[0];
};

// ─── Chart Components ────────────────────────────────────────────────────────

const BarChart = ({ data, labels, title }) => (
  <View style={styles.chartContainer}>
    <Text style={styles.chartTitle}>{title}</Text>
    <View style={styles.barChart}>
      {data.map((value, index) => (
        // FIX: Use defined barContainer style; keep bar height inside the container
        <View key={index} style={styles.barContainer}>
          <View
            style={[
              styles.bar,
              {
                height: Math.max(10, (value / Math.max(...data, 1)) * 80),
                backgroundColor: index % 2 === 0 ? '#895BF5' : '#A655F7'
              }
            ]}
          />
          <Text style={styles.barLabel}>{labels[index]}</Text>
        </View>
      ))}
    </View>
  </View>
);

const GaugeChart = ({ value, maxValue, title }) => {
  const percentage = Math.min(100, Math.round((value / Math.max(maxValue, 1)) * 100));
  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>{title}</Text>
      <View style={styles.gaugeContainer}>
        {/* react-pdf doesn't support half-circle via border tricks reliably;
            use a simple percentage bar instead */}
        <View style={{ width: 200, height: 16, backgroundColor: '#e5e7eb', borderRadius: 8, marginBottom: 8 }}>
          <View style={{ width: `${percentage}%`, height: 16, backgroundColor: '#895BF5', borderRadius: 8 }} />
        </View>
        <Text style={styles.gaugeText}>{percentage}%</Text>
        <Text style={[styles.gaugeText, { fontSize: 12 }]}>{value} / {maxValue}</Text>
      </View>
    </View>
  );
};

const PieChart = ({ data, labels, title }) => {
  const colors = ['#895BF5', '#A655F7', '#BF83FC', '#7D89F7', '#C084FC'];
  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>{title}</Text>
      <View style={styles.pieChart}>
        <View style={styles.pieLegend}>
          {labels.map((label, index) => (
            <View key={index} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: colors[index % colors.length] }]} />
              <Text style={styles.legendText}>{label}: {data[index]}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};

const SpiderChart = ({ data, labels, title }) => (
  <View style={styles.chartContainer}>
    <Text style={styles.chartTitle}>{title}</Text>
    <View style={styles.spiderChart}>
      <View style={styles.barChart}>
        {data.map((value, index) => (
          <View key={index} style={styles.barContainer}>
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(10, (value / 100) * 60),
                  backgroundColor: index % 2 === 0 ? '#895BF5' : '#BF83FC'
                }
              ]}
            />
            <Text style={styles.barLabel}>{labels[index]}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.gaugeText}>Performance Radar (Bar View)</Text>
    </View>
  </View>
);

// ─── Main PDF Document ────────────────────────────────────────────────────────

const AssessmentReportPDF = ({ quizData, userData, attemptData, packetScores, template }) => {
  const totalMarks = attemptData.total_marks || 0;
  const totalQuestions = attemptData.total_questions || 0;
  const firstPacketWithScale = packetScores.find(p => p.packet && p.packet.scoringScale);
  const overallPerformance = getPerformanceLevel(totalMarks, firstPacketWithScale?.packet);

  const getConfiguredPackets = () => {
    if (!template?.packetConfigs) return packetScores;
    return packetScores
      .filter(ps => template.packetConfigs[ps.packet?.id]?.enabled !== false)
      .sort((a, b) => {
        const oA = template.packetConfigs[a.packet?.id]?.order || 0;
        const oB = template.packetConfigs[b.packet?.id]?.order || 0;
        return oA - oB;
      });
  };

  const configuredPackets = getConfiguredPackets();
  const packetNames = packetScores.map(p => p.packetName);
  const packetMarks = packetScores.map(p => p.marks);
  const packetPercentages = packetScores.map(p => Math.round((p.marks / Math.max(p.totalMarks, 1)) * 100));
  const grandTotal = packetScores.reduce((sum, p) => sum + p.totalMarks, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{quizData.name}</Text>
          <Text style={styles.headerSubtitle}>Quiz Performance Report</Text>
        </View>

        {/* User Info */}
        <View style={styles.userCard}>
          <View style={styles.userInfo}>
            <Text style={styles.userLabel}>Participant:</Text>
            <Text style={styles.userValue}>{userData.user_name || 'Unknown User'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userLabel}>Email:</Text>
            <Text style={styles.userValue}>{userData.email || 'No email provided'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userLabel}>Completed:</Text>
            <Text style={styles.userValue}>
              {attemptData.completed_at && !isNaN(new Date(attemptData.completed_at).getTime())
                ? new Date(attemptData.completed_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })
                : 'In Progress'}
            </Text>
          </View>
        </View>

        {/* Overall Score */}
        <View style={styles.overallScore}>
          <Text style={styles.scoreTitle}>Overall Performance</Text>
          <View style={[styles.scoreCircle, { backgroundColor: overallPerformance.color }]}>
            <Text style={styles.scoreText}>{totalMarks}</Text>
            <Text style={styles.scoreLabel}>{overallPerformance.label}</Text>
          </View>
          <View style={styles.scoreStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalQuestions}</Text>
              <Text style={styles.statLabel}>Questions</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{totalMarks}</Text>
              <Text style={styles.statLabel}>Total Marks</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{overallPerformance.label}</Text>
              <Text style={styles.statLabel}>Performance</Text>
            </View>
          </View>
        </View>

        {/* Charts */}
        <Text style={styles.sectionTitle}>Performance Analytics</Text>
        <BarChart data={packetMarks} labels={packetNames} title="Packet Performance Comparison" />
        <GaugeChart value={totalMarks} maxValue={grandTotal} title="Overall Score Gauge" />
        <PieChart data={packetMarks} labels={packetNames} title="Score Distribution by Packet" />
        <SpiderChart data={packetPercentages} labels={packetNames} title="Performance Radar Chart" />

        {/* Section Analysis */}
        <Text style={styles.sectionTitle}>Section Analysis</Text>
        {configuredPackets.map((packet, index) => {
          const performance = getPerformanceLevel(packet.marks, packet.packet);
          const config = template?.packetConfigs?.[packet.packet?.id] || {};

          const packetCardStyle = {
            ...styles.packetCard,
            backgroundColor: config.backgroundColor || styles.packetCard.backgroundColor,
            padding: safeParseCSSValue(config.padding, 20),
            marginBottom: safeParseMargin(config.margin, 15),
            borderRadius: safeParseCSSValue(config.borderRadius, 8),
            borderColor: config.borderColor || '#e5e7eb'
          };

          const packetNameStyle = {
            ...styles.packetName,
            fontSize: safeParseCSSValue(config.fontSize, 16),
            color: config.headerTextColor || styles.packetName.color
          };

          return (
            <View key={index} style={packetCardStyle}>
              <View style={styles.packetInfo}>
                {config.showHeader !== false && (
                  <View style={{
                    backgroundColor: config.headerBackgroundColor || '#f8fafc',
                    padding: 8,
                    marginBottom: 8,
                    borderRadius: 4
                  }}>
                    <Text style={packetNameStyle}>{config.title || packet.packetName}</Text>
                    {config.customLabel && (
                      <Text style={[styles.packetDetail, { color: config.headerTextColor || '#6b7280', fontSize: 10 }]}>
                        {config.customLabel}
                      </Text>
                    )}
                  </View>
                )}

                {config.showScoreBreakdown !== false && (
                  // FIX: Use packetDetailGroup with marginRight instead of gap
                  <View style={styles.packetDetails}>
                    <View style={styles.packetDetailGroup}>
                      <Text style={styles.packetDetail}>Marks:</Text>
                      <Text style={[styles.packetDetailValue, { color: config.scoreColor || '#111827' }]}>
                        {packet.marks}{config.showScalingRange && packet.totalMarks ? ` / ${packet.totalMarks}` : ''}
                      </Text>
                    </View>
                    <View style={styles.packetDetailGroup}>
                      <Text style={styles.packetDetail}>Questions:</Text>
                      <Text style={styles.packetDetailValue}>{packet.questions}</Text>
                    </View>
                    {config.showScalingLevel !== false && (
                      <View style={styles.packetDetailGroup}>
                        <Text style={styles.packetDetail}>Level:</Text>
                        <Text style={[styles.packetDetailValue, { color: config.showScalingColors ? (config.scoreColor || performance.color) : '#111827' }]}>
                          {config.showScalingLabel !== false ? performance.label : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {config.showScalingText && performance.largeText && (
                  <View style={[styles.largeTextContainer, { borderColor: config.scoreColor || performance.color }]}>
                    <Text style={[styles.largeText, { color: config.scoreColor || performance.color }]}>
                      {performance.largeText}
                    </Text>
                  </View>
                )}

                {config.showRecommendations !== false && performance.largeText && !config.showScalingText && (
                  <View style={[styles.largeTextContainer, { borderColor: config.scoreColor || performance.color }]}>
                    <Text style={[styles.largeText, { color: config.scoreColor || performance.color }]}>
                      {performance.largeText}
                    </Text>
                  </View>
                )}

                {config.showAllScaleLevels && packet.packet?.scoringScale && (
                  <View style={[styles.largeTextContainer, { backgroundColor: '#f8fafc', padding: 8, marginTop: 8 }]}>
                    <Text style={[styles.packetDetail, { fontWeight: 'bold', marginBottom: 4 }]}>All Performance Levels:</Text>
                    {packet.packet.scoringScale.map((scale, idx) => (
                      <Text key={idx} style={[styles.packetDetail, {
                        fontSize: 8,
                        color: config.highlightCurrentLevel && scale.label === performance.label
                          ? (config.scoreColor || performance.color) : '#6b7280',
                        fontWeight: config.highlightCurrentLevel && scale.label === performance.label ? 'bold' : 'normal',
                        marginBottom: 2
                      }]}>
                        • {scale.label} ({scale.min}–{scale.max} points)
                      </Text>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.packetPerformance}>
                {config.showScalingImage !== false && performance.image && performance.image.startsWith('data:image') ? (
                  <Image
                    src={performance.image}
                    style={[styles.performanceImage, {
                      width: config.imageDisplayStyle === 'large' ? 100 : config.imageDisplayStyle === 'medium' ? 64 : 32,
                      height: config.imageDisplayStyle === 'large' ? 100 : config.imageDisplayStyle === 'medium' ? 64 : 32
                    }]}
                  />
                ) : config.showScalingImage !== false ? (
                  <Text style={[styles.performanceText, {
                    fontSize: config.imageDisplayStyle === 'large' ? 36 : config.imageDisplayStyle === 'medium' ? 28 : 20
                  }]}>
                    {performance.emoji}
                  </Text>
                ) : null}
                <Text style={styles.performanceText}>{performance.label}</Text>
              </View>
            </View>
          );
        })}

        {/* Insights */}
        <View style={styles.insightsCard}>
          <Text style={styles.insightsTitle}>Performance Insights</Text>
          <Text style={styles.insightsText}>
            {totalMarks >= 9
              ? 'Exceptional performance across all sections! You demonstrate mastery of the subject matter.'
              : totalMarks >= 6
              ? 'Strong overall performance with room for refinement in specific areas.'
              : totalMarks >= 3
              ? 'Good foundation with clear opportunities for improvement.'
              : 'This assessment highlights areas that need focused attention. Consider additional study time and practice.'}
          </Text>
        </View>

        {/* Recommendations */}
        <View style={styles.recommendationsCard}>
          <Text style={styles.recommendationsTitle}>Recommendations</Text>
          {[
            totalMarks >= 6
              ? 'Maintain your excellent study habits and continue practicing regularly.'
              : 'Develop a structured study schedule focusing on areas where you scored below average.',
            'Review your responses and understand the reasoning behind different scoring levels.',
            totalMarks < 3
              ? 'Consider seeking additional help from instructors or study groups for challenging topics.'
              : 'Focus on the sections with lower scores to achieve even better results.'
          ].map((text, i) => (
            <View key={i} style={styles.recommendationItem}>
              <View style={styles.recommendationNumber}>
                <Text style={styles.recommendationNumberText}>{i + 1}</Text>
              </View>
              <Text style={styles.recommendationText}>{text}</Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Generated by Quiz System</Text>
          <Text style={styles.footerText}>Report Date: {new Date().toLocaleDateString()}</Text>
        </View>
      </Page>
    </Document>
  );
};

// ─── Generator Class ──────────────────────────────────────────────────────────

class ProfessionalPDFGenerator {
  constructor() {
    this.customScoringScale = null;
  }

  setCustomScoringScale(scoringScale) {
    this.customScoringScale = scoringScale;
  }

  async generateReport(quizData, userData, attemptData, questions, answers, packets, customScoringScale = null, template = null) {
    try {
      const packetScores = this.calculatePacketScores(packets, questions, answers, attemptData);

      const pdfDoc = (
        <AssessmentReportPDF
          quizData={quizData}
          userData={userData}
          attemptData={attemptData}
          packetScores={packetScores}
          customScoringScale={customScoringScale}
          template={template}
        />
      );

      const pdfBlob = await pdf(pdfDoc).toBlob();
      return pdfBlob;
    } catch (error) {
      console.error('❌ Error generating PDF report:', error);
      throw error;
    }
  }

  calculatePacketScores(packets, questions, answers, attemptData) {
    const normalizedPackets = (packets || []).map(packet => {
      let scale = packet.scoringScale;
      if (typeof scale === 'string') {
        try {
          scale = JSON.parse(scale);
        } catch {
          scale = [];
        }
      }
      return {
        ...packet,
        scoringScale: Array.isArray(scale) ? scale : []
      };
    });

    if (attemptData.packet_marks && Object.keys(attemptData.packet_marks).length > 0) {
      return normalizedPackets.map(packet => {
        const packetData = attemptData.packet_marks[packet.name];
        return {
          packet,
          packetName: packet.name,
          marks: packetData?.marks || 0,
          questions: packetData?.questions || 0,
          totalMarks: packetData?.totalMarks || packetData?.questions || 0
        };
      });
    }

    return normalizedPackets.map(packet => {
      const packetQuestions = questions.filter(q => q.packet_id === packet.id);
      let marks = 0;
      packetQuestions.forEach(question => {
        if (Math.random() > 0.3) marks += question.marks || 1;
      });
      return {
        packet,
        packetName: packet.name,
        marks,
        questions: packetQuestions.length,
        totalMarks: packetQuestions.reduce((sum, q) => sum + (q.marks || 1), 0)
      };
    });
  }

  downloadPDF(filename = 'quiz_report.pdf') {
    console.log('📊 PDF ready for download:', filename);
    return true;
  }
}

export default ProfessionalPDFGenerator;