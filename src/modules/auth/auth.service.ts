import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument, AccountStatus } from '../users/user.schema';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { CloudinaryService } from '../upload/cloudinary.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async validateUser(email: string, password: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase() })
      .select('+password_hash')
      .exec();

    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (user.account_status === 'banned') {
      throw new UnauthorizedException('Votre compte a été banni');
    }

    if (user.account_status === 'suspended') {
      throw new UnauthorizedException('Votre compte est suspendu');
    }

    return user;
  }

  async login(user: UserDocument) {
    const userId = user._id?.toString() || String(user._id);

    // ✅ NOUVEAU : Activer automatiquement le compte lors de la connexion
    if (user.account_status === AccountStatus.PENDING) {
      user.account_status = AccountStatus.ACTIVE;
      await user.save();
      this.logger.log(`Account activated for user: ${user.email}`);
    }

    const payload: JwtPayload = {
      email: user.email,
      sub: userId,
      role: user.role,
    };

    const access_token = this.jwtService.sign(payload);

    this.logger.log(`User ${user.email} logged in successfully`);

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: '24h',
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        profile_picture: user.profile_picture,
        role: user.role,
        account_status: user.account_status,
        preferred_categories: user.preferred_categories || [],
      },
    };
  }

  async register(registerDto: RegisterDto, photoFile?: Express.Multer.File) {
    const { email, username, password, profile_picture, ...rest } = registerDto as RegisterDto & {
      profile_picture?: string;
    };

    const [existingEmail, existingUsername] = await Promise.all([
      this.userModel.findOne({ email: email.toLowerCase() }).exec(),
      this.userModel.findOne({ username: username.toLowerCase() }).exec(),
    ]);

    if (existingEmail) {
      throw new ConflictException('Cet email est déjà utilisé');
    }

    if (existingUsername) {
      throw new ConflictException("Ce nom d'utilisateur est déjà pris");
    }

    // 📷 Déterminer l'URL de la photo de profil
    // 1) Fallback: valeur éventuelle envoyée dans le DTO (URL externe, image par défaut, etc.)
    let profilePictureUrl: string | undefined = profile_picture;

    // 2) 📤 Upload la photo de profil vers Cloudinary si un fichier est fourni
    if (photoFile) {
      try {
        const uploadResult = await this.cloudinaryService.uploadImage(photoFile);
        profilePictureUrl = uploadResult.secure_url;
        this.logger.log(`✅ Photo de profil uploadée vers Cloudinary pour ${email}`);
      } catch (error) {
        this.logger.error(`❌ Erreur upload photo de profil: ${error.message}`);
        throw new BadRequestException(`Erreur upload photo: ${error.message}`);
      }
    }

    const password_hash = await bcrypt.hash(password, 12);

    try {
      const newUser = await this.userModel.create({
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        password_hash,
        profile_picture: profilePictureUrl,
        ...rest,
      });

      this.logger.log(`New user registered: ${newUser.email}`);

      const { password_hash: _, ...userWithoutPassword } = newUser.toObject();
      return userWithoutPassword;
    } catch (error) {
      this.logger.error('Registration error:', error);
      throw new BadRequestException('Erreur lors de la création du compte');
    }
  }
}
