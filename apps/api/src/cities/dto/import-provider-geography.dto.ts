import { Type } from 'class-transformer';
import {
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Length,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';

export class ProviderGeographyEntityDto {
    @IsString()
    @MaxLength(160)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    externalId?: string;
}

export class ProviderGeographyCountryDto extends ProviderGeographyEntityDto {
    @IsString()
    @Length(2, 2)
    code: string;
}

export class ImportProviderGeographyDto {
    @IsString()
    @IsIn(['2gis'])
    provider: '2gis';

    @ValidateNested()
    @Type(() => ProviderGeographyCountryDto)
    country: ProviderGeographyCountryDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => ProviderGeographyEntityDto)
    region?: ProviderGeographyEntityDto;

    @ValidateNested()
    @Type(() => ProviderGeographyEntityDto)
    city: ProviderGeographyEntityDto;

    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude: number;

    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude: number;
}
