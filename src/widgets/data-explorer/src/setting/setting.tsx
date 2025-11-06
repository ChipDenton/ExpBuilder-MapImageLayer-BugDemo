import { React } from 'jimu-core'
import type { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection } from 'jimu-ui/advanced/setting-components'
import type { IMConfig } from '../config';


const Setting = (props: AllWidgetSettingProps<IMConfig>) => {


  const onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    props.onSettingChange({
      id: props.id,
      useMapWidgetIds: useMapWidgetIds
    })
  }

  return <div className="widget-setting-demo">
    <SettingSection title={props.intl.formatMessage({ id: 'selectMap', defaultMessage: 'Select Map' })}>
      <MapWidgetSelector useMapWidgetIds={props.useMapWidgetIds} onSelect={onMapWidgetSelected} />
    </SettingSection>
  </div>
}

export default Setting
