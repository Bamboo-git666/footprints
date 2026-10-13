// 地图控制器接口：非地图组件通过 AppContext 调用，无需直接依赖 MapLibre
export interface MapController {
  flyTo(lng: number, lat: number, zoom?: number): void
  /** 平滑聚焦到一组照片 */
  fitPhotoPoints(points: Array<{ lat: number; lng: number }>, maxZoom?: number): void
  /** 视野内全部已定位照片 */
  fitAll(): void
  getCenter(): { lat: number; lng: number }
  getZoom(): number
}
