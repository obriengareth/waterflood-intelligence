import { init } from 'echarts/core';
import { use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, MarkLineComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
use([LineChart, GridComponent, LegendComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);
export { init };
