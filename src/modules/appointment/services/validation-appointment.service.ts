import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { format, isAfter, isBefore, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { Model } from 'mongoose';
import { GlobalService } from 'src/modules/global-service/entities/global-service.entity';
import { LocalService } from 'src/modules/local-service/entities/local-service.entity';
import { Appointment } from 'src/shared/interfaces/appointment.interface';
import { Auth } from 'src/shared/interfaces/auth.interface';
import { Unit } from 'src/shared/interfaces/unit.interface';

@Injectable()
export class AppointmentValidationService {
  constructor(
    @InjectModel('Appointment')
    private readonly appointmentModel: Model<Appointment>,
    @InjectModel('GlobalService')
    private readonly globalServiceModel: Model<GlobalService>,
    @InjectModel('LocalService')
    private readonly localServiceModel: Model<LocalService>,
    @InjectModel('Auth')
    private readonly authModel: Model<Auth>,
    @InjectModel('Unit')
    private readonly unitModel: Model<Unit>,
  ) {}

  calculateAvailableSlots(
    start: string,
    end: string,
    formattedTimes: string[],
  ) {
    const slots = [];

    let startMinutes =
      parseInt(start.split(':')[0]) * 60 + parseInt(start.split(':')[1]);
    const endMinutes =
      parseInt(end.split(':')[0]) * 60 + parseInt(end.split(':')[1]);

    while (startMinutes < endMinutes) {
      const hours = Math.floor(startMinutes / 60)
        .toString()
        .padStart(2, '0');
      const minutes = (startMinutes % 60).toString().padStart(2, '0');
      slots.push(`${hours}:${minutes}`);
      startMinutes += 45;
    }

    const availableSlots = slots.filter(
      (slot) => !formattedTimes.includes(slot),
    );

    return availableSlots;
  }
  async validateBarber(barberId: string) {
    const barber = await this.authModel
      .findOne({ _id: barberId, role: 'Barber' })
      .exec();
    if (!barber) throw new NotFoundException('Barber not found');
  }

  async validateAppointmentExistence(
    barber: string,
    unit: string,
    date: string,
    appointmentId?: string,
  ) {
    const existingAppointment = await this.appointmentModel
      .findOne({ barber, unit, date })
      .exec();
    if (
      existingAppointment &&
      existingAppointment._id.toString() !== appointmentId
    ) {
      throw new ConflictException(
        'An appointment already exists for this time slot at this unit.',
      );
    }
  }

  async validateServiceExistence(serviceId: string, serviceType: string) {
    if (serviceType === 'local') {
      const service = await this.localServiceModel.findById(serviceId).exec();
      if (!service) throw new NotFoundException('Local service not found');
    } else if (serviceType === 'global') {
      const service = await this.globalServiceModel.findById(serviceId).exec();
      if (!service) throw new NotFoundException('Global service not found');
    }
  }

  async validateAppointmentTime(date: string, unitId: string) {
    const unitExists = await this.unitModel.findById(unitId).exec();
    if (!unitExists) {
      throw new NotFoundException('Unit not found');
    }

    const operatingHours = unitExists.operatingHours;
    const appointmentDate = parseISO(date);
    const dayOfWeek = format(appointmentDate, 'eeee', {
      locale: enUS,
    }).toLowerCase();
    const hours = operatingHours[dayOfWeek];

    if (!hours || !hours.start || !hours.end) {
      throw new BadRequestException(
        'The unit does not operate on the selected day.',
      );
    }

    const appointmentTime = format(appointmentDate, 'HH:mm');
    const startTime = parseISO(`1970-01-01T${hours.start}:00`);
    const endTime = parseISO(`1970-01-01T${hours.end}:00`);

    if (
      isBefore(parseISO(`1970-01-01T${appointmentTime}:00`), startTime) ||
      isAfter(parseISO(`1970-01-01T${appointmentTime}:00`), endTime)
    ) {
      throw new BadRequestException(
        `The appointment time must be between ${hours.start} and ${hours.end}.`,
      );
    }
  }

  async validateUserPermission(
    userRole: string,
    userId: string,
    clientId: string,
    barberId: string,
  ) {
    if (userRole === 'Admin' || userRole === 'Developer') return;
    if (userRole === 'Client' && clientId !== userId)
      throw new ForbiddenException('Permission denied.');
    if (userRole === 'Barber' && barberId !== userId)
      throw new ForbiddenException('Permission denied.');
  }

  async validatePermission(
    userRole: string,
    userId: string,
    targetId: string,
    allowedRoles: string[] = ['Admin', 'Developer', 'Barber', 'Client'],
  ) {
    if (!allowedRoles.includes(userRole)) return;

    if (userId !== targetId) {
      throw new ForbiddenException(
        `You do not have permission to access this resource`,
      );
    }
  }

  async getModelToPopulate(
    appointmentModel: any,
    filter: Record<string, string>,
  ) {
    const serviceType = await appointmentModel
      .findOne(filter)
      .select('serviceType')
      .lean();

    if (!serviceType) {
      throw new NotFoundException('No appointments found for this filter');
    }

    return serviceType.serviceType === 'global'
      ? 'GlobalService'
      : 'LocalService';
  }

  getPopulateOptions() {
    return [
      {
        path: 'client',
        model: 'Auth',
        select: 'name',
      },
      {
        path: 'barber',
        model: 'Auth',
        select: 'name',
      },
      {
        path: 'unit',
        model: 'Unit',
        select: 'address',
      },
    ];
  }

  async findOneWithValidation(
    id: string,
    userId: string,
    userRole: string,
    relationKey: 'client' | 'barber',
  ) {
    const appointment = await this.appointmentModel.findById(id).exec();

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }
    if (
      !['Admin', 'Developer'].includes(userRole) &&
      appointment[relationKey].toString() !== userId
    ) {
      throw new ForbiddenException(
        `You do not have permission to access this appointment`,
      );
    }

    return appointment;
  }
}
