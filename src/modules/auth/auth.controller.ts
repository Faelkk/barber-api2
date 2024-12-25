import {
  Controller,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UploadedFiles,
  UseInterceptors,
  Delete,
  Get,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './services/auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { LoginUserDto } from './dto/login-auth-dto';
import { IsPublic } from 'src/shared/decorators/isPublic';
import { Role, Roles } from 'src/shared/decorators/isRoles';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { SupabaseService } from 'src/shared/supabase/supabase.service';
import { RolesGuard } from '../roles/roles.guard';
import { ActiveUserId } from 'src/shared/decorators/activeUserId';
import { activeBarberShop } from 'src/shared/decorators/activeBarberShop';

@Controller('auth')
@UseGuards(RolesGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @IsPublic()
  @Post()
  create(@Body() createAuthDto: CreateAuthDto) {
    return this.authService.createUser(createAuthDto);
  }

  @IsPublic()
  @Post('login')
  login(@Body() signinDto: LoginUserDto) {
    return this.authService.login(signinDto);
  }

  @Post('create-barber')
  @Roles(Role.Admin)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'avatar', maxCount: 1 },
      { name: 'thumbnail', maxCount: 1 },
    ]),
  )
  async createUserWithFiles(
    @Body() createAuthDto: CreateAuthDto,
    @UploadedFiles()
    files: {
      avatar?: Express.Multer.File[];
      thumbnail?: Express.Multer.File[];
    },
  ) {
    const { avatarUrl, thumbnailUrl } = await this.uploadFiles(files);
    return this.authService.createUserWithRole(
      createAuthDto,
      'Barber',
      avatarUrl,
      thumbnailUrl,
    );
  }

  @Post('create-developer')
  @Roles(Role.Developer)
  createDeveloper(@Body() createAuthDto: CreateAuthDto) {
    return this.authService.createUserWithRole(createAuthDto, 'Developer');
  }

  @Post('create-admin')
  @Roles(Role.Admin, Role.Developer)
  createAdmin(@Body() createAuthDto: CreateAuthDto) {
    return this.authService.createUserWithRole(createAuthDto, 'Admin');
  }

  @Get()
  @Roles(Role.Admin, Role.Developer)
  findAll(@Query('barberShopId') barberShopId: string) {
    return this.authService.findAll(barberShopId);
  }

  @Get('me')
  findMe(
    @ActiveUserId() userId: string,
    @activeBarberShop() barberShop: string,
  ) {
    return this.authService.findMe(userId, barberShop);
  }

  @Get(':id')
  @Roles(Role.Admin, Role.Developer)
  findOne(
    @Param('id') id: string,
    @Query('barberShopId') barberShopId: string,
  ) {
    return this.authService.findOne(id, barberShopId);
  }

  @Patch('update-user/:id')
  updateUser(@Param('id') id: string, @Body() updateAuthDto: UpdateAuthDto) {
    return this.authService.updateUser(id, updateAuthDto);
  }

  @Patch('update-barber/:id')
  @Roles(Role.Admin, Role.Barber || Role.Developer)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'avatar', maxCount: 1 },
      { name: 'thumbnail', maxCount: 1 },
    ]),
  )
  async updateBarber(
    @Param('id') id: string,
    @Body() updateAuthDto: UpdateAuthDto,
    @UploadedFiles()
    files: {
      avatar?: Express.Multer.File[];
      thumbnail?: Express.Multer.File[];
    },
  ) {
    const { avatarUrl, thumbnailUrl } = await this.uploadFiles(files);

    return this.authService.updateBarber(
      id,
      updateAuthDto,
      avatarUrl,
      thumbnailUrl,
    );
  }

  @Patch('update-admin/:id')
  @Roles(Role.Admin, Role.Developer)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'avatar', maxCount: 1 },
      { name: 'thumbnail', maxCount: 1 },
    ]),
  )
  async updateAdmin(
    @Param('id') id: string,
    @Body() updateAuthDto: UpdateAuthDto,
    @UploadedFiles()
    files: {
      avatar?: Express.Multer.File[];
      thumbnail?: Express.Multer.File[];
    },
  ) {
    const { avatarUrl, thumbnailUrl } = await this.uploadFiles(files);

    return this.authService.updateAdmin(
      id,
      updateAuthDto,
      avatarUrl,
      thumbnailUrl,
    );
  }

  @Delete(':id')
  @Roles(Role.Admin, Role.Developer)
  remove(@Param('id') id: string, @Query('barberShopId') barberShopId: string) {
    return this.authService.remove(id, barberShopId);
  }

  private async uploadFiles(files: {
    avatar?: Express.Multer.File[];
    thumbnail?: Express.Multer.File[];
  }) {
    const avatarUrl = files.avatar
      ? await this.supabaseService.uploadFile('auth', files.avatar[0])
      : undefined;
    const thumbnailUrl = files.thumbnail
      ? await this.supabaseService.uploadFile('auth', files.thumbnail[0])
      : undefined;
    return { avatarUrl, thumbnailUrl };
  }
}
