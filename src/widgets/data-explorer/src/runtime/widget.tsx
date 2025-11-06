import { type DataSource, DataSourceManager, type IMDataSourceJson, React, type AllWidgetProps, dataSourceUtils } from 'jimu-core'

import { type JimuMapView, JimuMapViewComponent } from 'jimu-arcgis'
import type { FeatureLayerDataSourceConstructorOptions } from 'jimu-data-source'

import MapImageLayer from "@arcgis/core/layers/MapImageLayer.js";
import { Button } from 'jimu-ui';

const DataExplorerWidget = (props: AllWidgetProps<any>) => {
  const [jimuMapView, setJimuMapView] = React.useState<JimuMapView>(null)

  async function onClickFunction(event): Promise<void> {
    console.log('onClickFunction()')
    const serviceUrl = "https://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer"
    const sublayerId = 7

    const layerUrl = serviceUrl + "/" + sublayerId

    if (jimuMapView) {
      const dataSourceID = getDataSourceIdForURL(layerUrl);
      const ds = await createDataSource(dataSourceID)

      // update the layer name to match the feature/map service instead of the Portal item
      const schema = ds.getSchema()
      schema.label = "test1"
      ds.setSchema(schema);
  
      const jimuLayerView = await jimuMapView.addLayerToMap(ds.id, ds.id)

      console.log('jimuLayerView', jimuLayerView)

      jimuLayerView.layer.sublayers.forEach((sl) => {
        const isKeep = sl.id === sublayerId;
        sl.visible = isKeep;
        sl.listMode = isKeep ? 'show' : 'hide';
        sl.legendEnabled = isKeep;
        sl.popupEnabled = isKeep;
      });
    }
  }

  const slugify = (url: string) => {
    return url
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .replace(/-+/g, '-');
  }
  
  const getDataSourceIdForURL = (url: string) => {
    return `added_dynamically_${slugify(url)}`
  }

  async function createDataSource(dsId: string): Promise<DataSource> {
    const dsJson = await fetchDataSourceJson(dsId)
    
    // Is there a corresponding ConstrutorOptions for MapImageLayer??
    const dsOptions: FeatureLayerDataSourceConstructorOptions = {
      id: dsId,
      dataSourceJson: dsJson
    }
    return DataSourceManager.getInstance().createDataSource(dsOptions)
  }

  async function fetchDataSourceJson(dsId: string): Promise<IMDataSourceJson> {
    const mil = new MapImageLayer({
      // url: url
      portalItem: {
        id: "855c7662f59c4e69b01c0d70dd53c29a"
      }
    })

    mil.title = "test1"
    await mil.load();
    // You can create data source json by a Maps SDK layer.
    const dsJson = dataSourceUtils.dataSourceJsonCreator.createDataSourceJsonByJSAPILayer(dsId, mil)
  
    return dsJson
  }

  return (
    <div className="data-explorer" style={{ height: '100%' }}>
      <JimuMapViewComponent
        useMapWidgetId={props.useMapWidgetIds?.[0]}
        onActiveViewChange={(jmv) => {
          console.log('onActiveViewChange()')
          setJimuMapView(jmv)
        }}
      />
      <Button onClick={onClickFunction}>Click to Add Map Service</Button>
    </div>
  )
}

export default DataExplorerWidget
