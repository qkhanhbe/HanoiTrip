import type { Point } from './contracts.js';
export const places: (Point & { area: string })[] = [
  { label: 'Hồ Hoàn Kiếm', area: 'Hoàn Kiếm', latitude: 21.0287, longitude: 105.8523 },
  { label: 'Văn Miếu – Quốc Tử Giám', area: 'Đống Đa', latitude: 21.0272, longitude: 105.8355 },
  { label: 'Bảo tàng Dân tộc học', area: 'Cầu Giấy', latitude: 21.0404, longitude: 105.7982 },
  { label: 'Ga Cát Linh', area: 'Đống Đa', latitude: 21.0285, longitude: 105.8274 },
  { label: 'Ga Hà Nội', area: 'Hoàn Kiếm', latitude: 21.0245, longitude: 105.8412 },
  { label: 'Lăng Chủ tịch Hồ Chí Minh', area: 'Ba Đình', latitude: 21.0369, longitude: 105.8346 },
  { label: 'Nhà hát Lớn Hà Nội', area: 'Hoàn Kiếm', latitude: 21.0241, longitude: 105.8575 },
  { label: 'Công viên Thống Nhất', area: 'Hai Bà Trưng', latitude: 21.0096, longitude: 105.8433 },
  { label: 'Chợ Đồng Xuân', area: 'Hoàn Kiếm', latitude: 21.0381, longitude: 105.8498 },
  { label: 'Hồ Tây', area: 'Tây Hồ', latitude: 21.058, longitude: 105.8193 },
  {
    label: 'Đại học Bách khoa Hà Nội',
    area: 'Hai Bà Trưng',
    latitude: 21.0063,
    longitude: 105.8431,
  },
  {
    label: 'Trung tâm Hội nghị Quốc gia',
    area: 'Nam Từ Liêm',
    latitude: 21.006,
    longitude: 105.7892,
  },
  { label: 'Bến xe Mỹ Đình', area: 'Nam Từ Liêm', latitude: 21.0287, longitude: 105.7789 },
  { label: 'Công viên Cầu Giấy', area: 'Cầu Giấy', latitude: 21.0304, longitude: 105.7902 },
];
export const toPoint = ({ label, latitude, longitude }: Point): Point => ({
  label,
  latitude,
  longitude,
});
export const normalizeText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
