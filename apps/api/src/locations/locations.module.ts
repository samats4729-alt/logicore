import { Module } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { LocationGeocodingService } from './location-geocoding.service';
import { GeoModule } from '../geo/geo.module';

@Module({
    imports: [GeoModule],
    controllers: [LocationsController],
    providers: [LocationsService, LocationGeocodingService],
    exports: [LocationsService],
})
export class LocationsModule { }
