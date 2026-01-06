import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MessagerieService } from './messagerie.service';
import { SendMessageDto } from './dto/send-message.dto';
import { GetConversationByParticipantDto } from './dto/get-conversation-by-participant.dto';
import { ParticipantType } from './message.schema';

@ApiTags('Messagerie')
@ApiBearerAuth('JWT-auth')
@Controller('api/messagerie')
@UseGuards(JwtAuthGuard)
export class MessagerieController {
  private readonly logger = new Logger(MessagerieController.name);

  constructor(private readonly messagerieService: MessagerieService) {}

  @Post('send')
  @ApiOperation({
    summary: 'Envoyer un message',
    description:
      'Envoie un message à un utilisateur ou un restaurant. Si vous envoyez à un restaurant, le message sera reçu par le propriétaire du restaurant.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Message envoyé avec succès',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Erreur de validation',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Destinataire non trouvé',
  })
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        recipient_id: {
          type: 'string',
          description:
            "ID du restaurant ou de l'utilisateur destinataire (restaurant.id ou user.user_id)",
          example: '1cf6a627-3510-4017-b951-523fa5aecf34',
        },
        content: {
          type: 'string',
          description: 'Contenu du message',
          example: 'Bonjour, est-ce que vous êtes ouverts ce soir ?',
        },
        attachments: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Pièces jointes (URLs d'images, vidéos, fichiers) – optionnel",
          example: ['https://example.com/image.jpg'],
        },
        reply_to_message_id: {
          type: 'string',
          description:
            'ID du message auquel vous répondez (laisser vide si nouveau message)',
          nullable: true,
        },
      },
      required: ['recipient_id', 'content'],
    },
  })
  async sendMessage(
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ) {
    try {
      this.logger.log(
        `📨 Envoi de message de ${user.user_id} à ${dto.recipient_id}`,
      );
      this.logger.log(`📝 Contenu: ${dto.content}`);

      const message = await this.messagerieService.sendMessage(
        user.user_id,
        ParticipantType.USER,
        dto,
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: 'Message envoyé avec succès',
        data: message,
      };
    } catch (error) {
      this.logger.error(`❌ Erreur lors de l'envoi du message: ${error.message}`);
      this.logger.error(`❌ Stack: ${error.stack}`);
      throw error;
    }
  }

  @Get('conversations')
  @ApiOperation({
    summary: 'Récupérer la liste de toutes les conversations',
    description:
      'Retourne la liste de toutes les conversations de l\'utilisateur connecté avec les informations de base sur chaque participant (sans détails des messages). Chaque conversation contient un participant_id qui peut être utilisé pour récupérer la conversation complète via GET /api/messagerie/conversation?participant_id={participant_id}',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Liste des conversations récupérée avec succès',
  })
  async getAllConversations(@CurrentUser() user: any) {
    try {
      this.logger.log(
        `📋 Récupération de toutes les conversations pour ${user.user_id}`,
      );

      const conversations = await this.messagerieService.getAllConversations(
        user.user_id,
      );

      return {
        statusCode: HttpStatus.OK,
        message: 'Conversations récupérées avec succès',
        data: conversations,
        count: conversations.length,
      };
    } catch (error) {
      this.logger.error(
        `❌ Erreur lors de la récupération des conversations: ${error.message}`,
      );
      throw error;
    }
  }

  @Get('conversation')
  @ApiOperation({
    summary: 'Récupérer tous les messages d\'une conversation',
    description:
      'Retourne tous les messages d\'une conversation avec un restaurant ou un utilisateur',
  })
  @ApiQuery({
    name: 'participant_id',
    description: 'ID du restaurant ou de l\'utilisateur avec lequel vous communiquez',
    example: 'restaurant-id-123 ou user-id-456',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Conversation récupérée avec succès',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Conversation ou participant non trouvé',
  })
  async getConversation(
    @CurrentUser() user: any,
    @Query() dto: GetConversationByParticipantDto,
  ) {
    try {
      this.logger.log(
        `💬 Récupération de la conversation entre ${user.user_id} et ${dto.participant_id}`,
      );

      const result = await this.messagerieService.conversation(
        user.user_id,
        dto.participant_id,
      );

      return {
        statusCode: HttpStatus.OK,
        message: 'Conversation récupérée avec succès',
        data: result,
        message_count: result.messages.length,
      };
    } catch (error) {
      this.logger.error(
        `❌ Erreur lors de la récupération de la conversation: ${error.message}`,
      );
      throw error;
    }
  }
}
