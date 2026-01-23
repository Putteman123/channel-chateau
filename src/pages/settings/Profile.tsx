import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Tv, Monitor, Smartphone } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSpatialNavigation } from '@/contexts/SpatialNavigationContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const profileSchema = z.object({
  display_name: z.string().min(2, 'Namn måste vara minst 2 tecken').max(50),
  avatar_url: z.string().url('Ogiltig URL').or(z.literal('')).optional(),
  preferred_device: z.enum(['desktop', 'mobile', 'tv']),
});

type ProfileForm = z.infer<typeof profileSchema>;

const deviceOptions = [
  { value: 'desktop', label: 'Dator', icon: Monitor, description: 'Standard mus & tangentbord' },
  { value: 'mobile', label: 'Mobil', icon: Smartphone, description: 'Pekskärmsnavigering' },
  { value: 'tv', label: 'TV', icon: Tv, description: 'D-pad & fjärrkontroll' },
];

export default function Profile() {
  const { user, profile, updateProfile } = useAuth();
  const { isTvMode, setTvMode } = useSpatialNavigation();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: profile?.display_name || '',
      avatar_url: profile?.avatar_url || '',
      preferred_device: (profile as any)?.preferred_device || 'desktop',
    },
  });

  // Update form when profile loads
  useEffect(() => {
    if (profile) {
      form.reset({
        display_name: profile.display_name || '',
        avatar_url: profile.avatar_url || '',
        preferred_device: (profile as any)?.preferred_device || 'desktop',
      });
    }
  }, [profile, form]);

  const onSubmit = async (data: ProfileForm) => {
    setIsLoading(true);
    try {
      await updateProfile({
        display_name: data.display_name,
        avatar_url: data.avatar_url || null,
        preferred_device: data.preferred_device,
      } as any);
      
      // Update TV mode based on selection
      setTvMode(data.preferred_device === 'tv');
      
      toast.success('Profil uppdaterad!');
    } catch (error: any) {
      toast.error('Kunde inte uppdatera profil: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Din profil</CardTitle>
          <CardDescription>
            Hantera din profilinformation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar preview */}
          <div className="flex items-center gap-4">
            <Avatar className="h-20 w-20">
              <AvatarImage src={form.watch('avatar_url') || undefined} />
              <AvatarFallback className="bg-primary text-2xl text-primary-foreground">
                {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{profile?.display_name || 'Användare'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="display_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Visningsnamn</FormLabel>
                    <FormControl>
                      <Input placeholder="Ditt namn" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="avatar_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avatar URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/avatar.jpg"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Device Preference */}
              <FormField
                control={form.control}
                name="preferred_device"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Enhetstyp</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
                      >
                        {deviceOptions.map((option) => (
                          <Label
                            key={option.value}
                            htmlFor={option.value}
                            className={cn(
                              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all hover:border-primary/50",
                              field.value === option.value
                                ? "border-primary bg-primary/5"
                                : "border-muted"
                            )}
                          >
                            <RadioGroupItem
                              value={option.value}
                              id={option.value}
                              className="sr-only"
                            />
                            <option.icon className={cn(
                              "h-8 w-8",
                              field.value === option.value ? "text-primary" : "text-muted-foreground"
                            )} />
                            <span className="font-medium">{option.label}</span>
                            <span className="text-xs text-muted-foreground text-center">
                              {option.description}
                            </span>
                          </Label>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* TV Mode indicator */}
              {isTvMode && (
                <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                  <Tv className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium text-yellow-500">TV-läge aktivt</p>
                    <p className="text-xs text-muted-foreground">
                      Navigera med piltangenter, Enter för att välja, Esc för att gå tillbaka
                    </p>
                  </div>
                </div>
              )}

              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Spara ändringar
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Kontoinformation</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">E-post</dt>
              <dd>{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Konto skapat</dt>
              <dd>
                {user?.created_at
                  ? new Date(user.created_at).toLocaleDateString('sv-SE')
                  : '-'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
