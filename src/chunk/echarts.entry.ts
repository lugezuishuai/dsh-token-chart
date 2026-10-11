/**
 * Build entry for the package-local lazy chunk `client.echarts.js`.
 *
 * Only what the token-usage surfaces actually draw is pulled in: bar, line and
 * pie series plus the grid/tooltip/legend/dataZoom components and the SVG
 * renderer.
 * Everything else ECharts ships (maps, 3D, GL, canvas renderer, the full
 * component set) is tree-shaken away by the bundler.
 */
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  // The x-axis range slider under the chart.
  DataZoomComponent,
  SVGRenderer,
])

export default echarts
